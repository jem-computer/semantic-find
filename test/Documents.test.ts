import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, FileSystem, Layer, Logger, Path } from "effect";
import { MAX_LINES, MAX_PASTE_CHARS } from "../lib/chunk";
import { Documents } from "../lib/Documents";
import { PasteStore } from "../lib/PasteStore";

const docJson = (id: string, extra: object = {}) =>
  JSON.stringify({ id, title: `Title ${id}`, source: "test", url: "", kind: "prose", lines: ["a", "b"], ...extra });

// A docs/ directory served from memory, keyed by file name.
const fakeDocsDir = (files: Record<string, string>) =>
  Layer.mergeAll(
    FileSystem.layerNoop({
      readDirectory: () => Effect.succeed(Object.keys(files)),
      readFileString: (path) => Effect.succeed(files[path.split("/").pop() ?? ""] ?? ""),
    }),
    Path.layer,
  );

const silent = Logger.layer([]);

const layerWith = (fs: Layer.Layer<FileSystem.FileSystem | Path.Path>) =>
  Documents.layer.pipe(Layer.provide([PasteStore.layer, fs, silent]));

const DefaultFiles = { "b.json": docJson("bravo"), "a.json": docJson("alpha"), "notes.txt": "not a doc" };

const run = <A, E>(
  effect: Effect.Effect<A, E, Documents>,
  fs: Layer.Layer<FileSystem.FileSystem | Path.Path> = fakeDocsDir(DefaultFiles),
) => Effect.runPromise(Effect.provide(effect, layerWith(fs)));

const withDocuments = <A, E>(f: (documents: Documents["Service"]) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    return yield* f(yield* Documents);
  });

describe("catalog", () => {
  test("loads every .json file in name order and ignores other files", async () => {
    const docs = await run(withDocuments((d) => d.list("s1")));

    expect(docs.map((d) => d.id)).toEqual(["alpha", "bravo"]);
  });

  test("catalog docs are visible to every session", async () => {
    const doc = await run(withDocuments((d) => d.get("anyone", "bravo")));

    expect(doc.title).toBe("Title bravo");
  });

  test("an invalid doc file fails startup", async () => {
    const fs = fakeDocsDir({ "bad.json": docJson("bad", { kind: "pdf" }) });

    await expect(run(withDocuments(Effect.succeed), fs)).rejects.toThrow();
  });

  test("malformed JSON fails startup", async () => {
    await expect(run(withDocuments(Effect.succeed), fakeDocsDir({ "bad.json": "{" }))).rejects.toThrow();
  });

  test("the bundled docs/ folder decodes", async () => {
    const docs = await run(
      withDocuments((d) => d.list("s1")),
      BunServices.layer,
    );

    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) expect(doc.lines.length).toBeGreaterThan(0);
  });

  test("an unknown id fails with DocNotFound", async () => {
    const error = await run(withDocuments((d) => Effect.flip(d.get("s1", "nope"))));

    expect(error._tag).toBe("DocNotFound");
    expect(error.id).toBe("nope");
  });
});

describe("paste", () => {
  const paste = (input: Parameters<Documents["Service"]["paste"]>[1], sid = "s1") =>
    run(withDocuments((d) => d.paste(sid, input)));
  const pasteError = (input: Parameters<Documents["Service"]["paste"]>[1]) =>
    run(withDocuments((d) => Effect.flip(d.paste("s1", input))));

  test("rejects blank text", async () => {
    const error = await pasteError({ text: "  \n\t " });

    expect(error.message).toBe("empty document");
  });

  test("rejects text over the size limit", async () => {
    const error = await pasteError({ text: "x".repeat(MAX_PASTE_CHARS + 1) });

    expect(error.message).toContain("document too large");
  });

  test("keeps the first MAX_LINES lines and flags truncation", async () => {
    const text = Array.from({ length: MAX_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
    const { doc, truncated } = await paste({ text });

    expect(doc.lines).toHaveLength(MAX_LINES);
    expect(truncated).toBe(true);
  });

  test("short pastes are not truncated", async () => {
    const { truncated } = await paste({ text: "one\ntwo" });

    expect(truncated).toBe(false);
  });

  test("guesses the kind from the text", async () => {
    expect((await paste({ text: "10:00 start\n10:01 stop\nnote" })).doc.kind).toBe("log");
    expect((await paste({ text: "# Title\nbody" })).doc.kind).toBe("markdown");
    expect((await paste({ text: "Just some prose." })).doc.kind).toBe("prose");
    expect((await paste({ text: "# Title\nbody", asCode: true })).doc.kind).toBe("code");
  });

  test("asCode keeps indentation", async () => {
    const { doc } = await paste({ text: "def f():\n    return 1", asCode: true });

    expect(doc.lines).toEqual(["def f():", "    return 1"]);
  });

  test("titles are trimmed and capped, with a numbered fallback", async () => {
    const { titled, untitled } = await run(
      Effect.gen(function* () {
        const d = yield* Documents;
        const titled = yield* d.paste("s1", { title: `  ${"t".repeat(100)}  `, text: "a" });
        const untitled = yield* d.paste("s1", { title: "   ", text: "a" });
        return { titled: titled.doc, untitled: untitled.doc };
      }),
    );

    expect(titled.title).toBe("t".repeat(80));
    expect(untitled.title).toBe(`Pasted document ${untitled.id.split("-")[1]}`);
    expect(titled.id).not.toBe(untitled.id);
  });

  test("pastes are private to the pasting session", async () => {
    const result = await run(
      Effect.gen(function* () {
        const d = yield* Documents;
        const { doc } = yield* d.paste("mine", { text: "secret" });
        return {
          id: doc.id,
          mine: yield* d.list("mine"),
          theirs: yield* d.list("theirs"),
          ownGet: yield* d.get("mine", doc.id),
          otherGet: yield* Effect.flip(d.get("theirs", doc.id)),
        };
      }),
    );

    expect(result.mine.map((d) => d.id)).toContain(result.id);
    expect(result.theirs.map((d) => d.id)).not.toContain(result.id);
    expect(result.ownGet.pasted).toBe(true);
    expect(result.otherGet._tag).toBe("DocNotFound");
  });
});
