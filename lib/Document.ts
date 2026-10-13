// The document model shared by the catalog, pasted documents, and search.
// A document is a list of lines; the line is the unit TypeSafe judges.

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

export class DocNotFound extends Schema.TaggedError<DocNotFound>()("DocNotFound", {
  id: Schema.String,
}) {}

export class InvalidPaste extends Schema.TaggedError<InvalidPaste>()("InvalidPaste", {
  message: Schema.String,
}) {}
