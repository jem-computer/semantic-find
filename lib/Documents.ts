// Every document a visitor can open: the sample catalog in docs/*.json,
// loaded and validated once at startup, plus their own pasted documents.

import { Context, Effect, FileSystem, Layer, Option, Path, Ref, Schema } from "effect";
import { MAX_LINES, MAX_PASTE_CHARS, codeToLines, textToLines } from "./chunk";
import { Doc, DocNotFound, InvalidPaste, type DocKind } from "./Document";
import { PasteStore } from "./PasteStore";

export const PasteInput = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  text: Schema.String,
  asCode: Schema.optionalKey(Schema.Boolean),
});
export interface PasteInput extends Schema.Schema.Type<typeof PasteInput> {}

export interface Pasted {
  readonly doc: Doc;
  readonly truncated: boolean;
}

const guessKind = (lines: ReadonlyArray<string>): DocKind => {
  const logish = lines.filter((l) => /^\d{2}:\d{2}(:\d{2})?/.test(l)).length > lines.length / 2;
  if (logish) return "log";
  return lines.some((l) => /^#{1,3} /.test(l)) ? "markdown" : "prose";
};

export class Documents extends Context.Service<
  Documents,
  {
    readonly list: (sid: string) => Effect.Effect<ReadonlyArray<Doc>>;
    readonly get: (sid: string, id: string) => Effect.Effect<Doc, DocNotFound>;
    readonly paste: (sid: string, input: PasteInput) => Effect.Effect<Pasted, InvalidPaste>;
  }
>()("semantic-find/Documents") {
  static readonly layer = Layer.effect(
    Documents,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const pastes = yield* PasteStore;

      const dir = path.join(import.meta.dir, "..", "docs");
      const decodeDoc = Schema.decodeUnknownEffect(Schema.fromJsonString(Doc));
      const files = (yield* fs.readDirectory(dir)).filter((f) => f.endsWith(".json")).sort();
      const catalog = new Map<string, Doc>();
      for (const doc of yield* Effect.forEach(files, (f) =>
        fs.readFileString(path.join(dir, f)).pipe(Effect.flatMap(decodeDoc)),
      )) {
        catalog.set(doc.id, doc);
      }
      yield* Effect.log(`Loaded ${catalog.size} docs: ${[...catalog.keys()].join(", ")}`);

      const pasteCount = yield* Ref.make(0);

      const get = Effect.fn("Documents.get")(function* (sid: string, id: string) {
        const shared = catalog.get(id);
        if (shared) return shared;
        const pasted = yield* pastes.get(sid, id);
        if (Option.isNone(pasted)) return yield* new DocNotFound({ id });
        return pasted.value;
      });

      // Pasted text is chunked server-side, held in memory only, and visible
      // only to the pasting session.
      const paste = Effect.fn("Documents.paste")(function* (sid: string, input: PasteInput) {
        if (!input.text.trim()) return yield* new InvalidPaste({ message: "empty document" });
        if (input.text.length > MAX_PASTE_CHARS) {
          return yield* new InvalidPaste({
            message: `document too large (max ${MAX_PASTE_CHARS.toLocaleString()} chars)`,
          });
        }
        const all = input.asCode ? codeToLines(input.text) : textToLines(input.text);
        if (all.length === 0) return yield* new InvalidPaste({ message: "empty document" });
        const lines = all.slice(0, MAX_LINES);

        const n = yield* Ref.updateAndGet(pasteCount, (c) => c + 1);
        const doc: Doc = {
          id: `pasted-${n}`,
          title: input.title?.trim().slice(0, 80) || `Pasted document ${n}`,
          source: "pasted (in memory, this visit only)",
          url: "",
          kind: input.asCode ? "code" : guessKind(lines),
          lines,
          pasted: true,
        };
        yield* pastes.add(sid, doc);
        return { doc, truncated: all.length > MAX_LINES };
      });

      return Documents.of({
        list: (sid) => Effect.map(pastes.list(sid), (pasted) => [...catalog.values(), ...pasted]),
        get,
        paste,
      });
    }),
  );
}
