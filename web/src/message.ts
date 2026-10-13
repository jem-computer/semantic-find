import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Dialog, RadioGroup } from '@foldkit/ui'

import { Doc, Layout, Search } from './domain'

export const Message = defineMessageUnion({
  CompletedStartSession: {},
  SucceededFetchDocList: { docs: Schema.Array(Doc.DocSummary) },
  FailedFetchDocList: { error: Schema.String },
  SelectedDoc: { docId: Schema.String },
  SucceededFetchDoc: { loadedDoc: Doc.LoadedDoc },
  FailedFetchDoc: { docId: Schema.String, error: Schema.String },
  UpdatedQuery: { value: Schema.String },
  SubmittedSearch: {},
  ClickedSuggestion: { query: Schema.String },
  GotModeRadioGroupMessage: { message: RadioGroup.Message },
  SucceededRunSearch: {
    generation: Schema.Number,
    result: Search.SearchResult,
  },
  FailedRunSearch: { generation: Schema.Number, error: Schema.String },
  ClickedMatch: { lineIndex: Schema.Number },
  CompletedScrollLineIntoView: {},
  CompletedWaitBeforeUnflash: { flashId: Schema.Number },
  MeasuredDocLayout: { layout: Layout.DocLayout },
  ScrolledDoc: { scrollTop: Schema.Number },
  PressedMinimap: { fraction: Schema.Number },
  MovedMinimapPointer: { fraction: Schema.Number },
  ReleasedMinimap: {},
  CompletedScrollDocTo: {},
  ClickedOpenPaste: {},
  GotPasteDialogMessage: { message: Dialog.Message },
  UpdatedPasteTitle: { value: Schema.String },
  UpdatedPasteText: { value: Schema.String },
  GotPasteKindRadioGroupMessage: { message: RadioGroup.Message },
  SubmittedPaste: {},
  SucceededCreatePaste: {
    docId: Schema.String,
    maybeTruncatedLineCount: Schema.Option(Schema.Number),
  },
  FailedCreatePaste: { error: Schema.String },
})
export type Message = typeof Message.Type
