// The document model shared by the catalog, pasted documents, and search.
// A document is a list of lines; the line is the unit Clef judges.

import { Schema } from "effect";

export const DocKind = Schema.Literals(["prose", "markdown", "log", "code"]);
export type DocKind = typeof DocKind.Type;

export const Doc = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  source: Schema.String,
  url: Schema.String,
  kind: DocKind,
  lines: Schema.Array(Schema.String),
  pasted: Schema.optionalKey(Schema.Boolean),
});
export interface Doc extends Schema.Schema.Type<typeof Doc> {}

// A pasted document before its store numbers it. Numbers are per session, so
// ids only need to be unique within one visitor's pastes.
export interface PasteDraft {
  readonly title: string;
  readonly kind: DocKind;
  readonly lines: ReadonlyArray<string>;
}

export const toPastedDoc = (n: number, draft: PasteDraft): Doc => ({
  id: `pasted-${n}`,
  title: draft.title || `Pasted document ${n}`,
  source: "pasted (this visit only)",
  url: "",
  kind: draft.kind,
  lines: draft.lines,
  pasted: true,
});

export class DocNotFound extends Schema.TaggedError<DocNotFound>()("DocNotFound", {
  id: Schema.String,
}) {}

export class InvalidPaste extends Schema.TaggedError<InvalidPaste>()("InvalidPaste", {
  message: Schema.String,
}) {}
