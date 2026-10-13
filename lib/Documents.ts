// Every document a visitor can open: the sample catalog bundled from
// docs/*.json, validated once at startup, plus their own pasted documents.

import { Context, Effect, Layer, Option, Schema } from "effect";
import { catalog as bundledCatalog } from "../docs";
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
  // Validates the raw catalog. The catalog ships inside the bundle, so an
  // invalid document is a build defect, not a runtime error.
  static readonly make = Effect.fnUntraced(function* (raw: ReadonlyArray<unknown>) {
    const pastes = yield* PasteStore;
    const catalog = new Map<string, Doc>();
    for (const doc of yield* Effect.orDie(Schema.decodeUnknownEffect(Schema.Array(Doc))(raw))) {
      catalog.set(doc.id, doc);
    }
    yield* Effect.log(`Loaded ${catalog.size} docs: ${[...catalog.keys()].join(", ")}`);

    const get = Effect.fn("Documents.get")(function* (sid: string, id: string) {
      const shared = catalog.get(id);
      if (shared) return shared;
      const pasted = yield* pastes.get(sid, id);
      if (Option.isNone(pasted)) return yield* new DocNotFound({ id });
      return pasted.value;
    });

    // Pasted text is chunked server-side and visible only to the pasting
    // session.
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

      const doc = yield* pastes.add(sid, {
        title: input.title?.trim().slice(0, 80) ?? "",
        kind: input.asCode ? "code" : guessKind(lines),
        lines,
      });
      return { doc, truncated: all.length > MAX_LINES };
    });

    return Documents.of({
      list: (sid) => Effect.map(pastes.list(sid), (pasted) => [...catalog.values(), ...pasted]),
      get,
      paste,
    });
  });

  static readonly layer = Layer.effect(Documents, Documents.make(bundledCatalog));
}
