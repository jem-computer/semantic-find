import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

import { Dialog, RadioGroup } from '@foldkit/ui'

import { Doc, Layout, Search } from './domain'

export const DocListData = AsyncData.Schema(
  Schema.Array(Doc.DocSummary),
  Schema.String,
)

export const LoadedDocData = AsyncData.Schema(Doc.LoadedDoc, Schema.String)

export const SearchData = AsyncData.Schema(Search.SearchResult, Schema.String)

export const PasteKind = Schema.Literals(['Auto', 'Code'])
export type PasteKind = typeof PasteKind.Type

export const PasteStatus = defineTaggedUnion({
  Ready: {},
  Submitting: {},
  Failed: { error: Schema.String },
  Truncated: { keptLineCount: Schema.Number },
})
export type PasteStatus = typeof PasteStatus.Type

export const PasteForm = Schema.Struct({
  dialog: Dialog.Model,
  title: Schema.String,
  text: Schema.String,
  kind: PasteKind,
  kindRadioGroup: RadioGroup.Model,
  status: PasteStatus,
})
export type PasteForm = typeof PasteForm.Type

const Flash = Schema.Struct({
  lineIndex: Schema.Number,
  flashId: Schema.Number,
})
export const MinimapDrag = defineTaggedUnion({
  Released: {},
  Dragging: {},
})
export type MinimapDrag = typeof MinimapDrag.Type

export const Model = Schema.Struct({
  docList: DocListData.schema,
  maybeSelectedDocId: Schema.Option(Schema.String),
  doc: LoadedDocData.schema,
  query: Schema.String,
  mode: Search.SearchMode,
  modeRadioGroup: RadioGroup.Model,
  searchGeneration: Schema.Number,
  search: SearchData.schema,
  maybeDocLayout: Schema.Option(Layout.DocLayout),
  scrollTop: Schema.Number,
  minimapDrag: MinimapDrag,
  flashCount: Schema.Number,
  maybeFlash: Schema.Option(Flash),
  pasteForm: PasteForm,
})
export type Model = typeof Model.Type
