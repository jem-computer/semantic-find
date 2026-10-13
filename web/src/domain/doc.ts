import { Schema } from 'effect'

export const DocKind = Schema.Literals(['Prose', 'Markdown', 'Log', 'Code'])
export type DocKind = typeof DocKind.Type

export const Doc = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  source: Schema.String,
  maybeUrl: Schema.Option(Schema.String),
  kind: DocKind,
  lines: Schema.Array(Schema.String),
})
export type Doc = typeof Doc.Type

export const DocSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  lineCount: Schema.Number,
})
export type DocSummary = typeof DocSummary.Type

export const LoadedDoc = Schema.Struct({
  doc: Doc,
  maybeCodeLanguage: Schema.Option(Schema.String),
})
export type LoadedDoc = typeof LoadedDoc.Type

const LINE_ID_DIGITS = 3

export const lineId = (lineIndex: number): string =>
  `L${String(lineIndex).padStart(LINE_ID_DIGITS, '0')}`

export const summaryLabel = ({ title, lineCount }: DocSummary): string =>
  `${title} · ${lineCount} lines`

const HEADING_MARKER = /^#{1,3} /
const WHOLE_LINE_EMPHASIS = /^\*(.+)\*$/

export const matchExcerpt = (text: string): string =>
  text.replace(HEADING_MARKER, '').replace(WHOLE_LINE_EMPHASIS, '$1')
