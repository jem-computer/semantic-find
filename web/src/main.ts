import { Array, Number, Option, Result, String, pipe } from 'effect'
import { AsyncData, type Runtime, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Dialog, RadioGroup } from '@foldkit/ui'

import {
  CreatePaste,
  FetchDoc,
  FetchDocList,
  RunSearch,
  ScrollDocTo,
  ScrollLineIntoView,
  StartSession,
  WaitBeforeUnflash,
} from './command'
import { Doc, Layout, Search, Suggestions } from './domain'
import { PASTE_TEXT_ID } from './ids'
import { Message } from './message'
import {
  DocListData,
  LoadedDocData,
  MinimapDrag,
  type Model,
  type PasteKind,
  PasteStatus,
  SearchData,
} from './model'
import { ModeRadioGroup, PasteKindRadioGroup } from './radioGroups'

export { Message } from './message'
export { Model } from './model'
export { subscriptions } from './subscription'
export { view } from './view/view'

type UpdateReturn = Update.Return<Model, Message>
type Step = Update.Step<Model, Message>

// INIT

export const initialModel: Model = {
  docList: DocListData.Idle(),
  maybeSelectedDocId: Option.none(),
  doc: LoadedDocData.Idle(),
  query: '',
  mode: 'Choice',
  modeRadioGroup: RadioGroup.init({ id: 'search-mode' }),
  searchGeneration: 0,
  search: SearchData.Idle(),
  maybeDocLayout: Option.none(),
  scrollTop: 0,
  minimapDrag: MinimapDrag.Released(),
  flashCount: 0,
  maybeFlash: Option.none(),
  pasteForm: {
    dialog: Dialog.init({
      id: 'paste-dialog',
      focusSelector: `#${PASTE_TEXT_ID}`,
    }),
    title: '',
    text: '',
    kind: 'Auto',
    kindRadioGroup: RadioGroup.init({ id: 'paste-kind' }),
    status: PasteStatus.Ready(),
  },
}

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: initialModel,
  commands: [StartSession()],
})

// DOCUMENTS

const isSelected = (model: Model, docId: string): boolean =>
  Option.contains(model.maybeSelectedDocId, docId)

const pickDocId = (
  model: Model,
  docs: ReadonlyArray<Doc.DocSummary>,
): Option.Option<string> => {
  const isListed = (docId: string) => Array.some(docs, ({ id }) => id === docId)

  return pipe(
    model.maybeSelectedDocId,
    Option.filter(isListed),
    Option.orElse(() =>
      Option.liftPredicate(Suggestions.DEFAULT_DOC_ID, isListed),
    ),
    Option.orElse(() => Option.map(Array.head(docs), ({ id }) => id)),
  )
}

const isOpenOrOpening = (model: Model, docId: string): boolean =>
  isSelected(model, docId) &&
  (AsyncData.isPending(model.doc) || AsyncData.hasData(model.doc))

const selectDoc =
  (docId: string): Step =>
  model => ({
    model: modifyFields(model, {
      maybeSelectedDocId: () => Option.some(docId),
      doc: () => LoadedDocData.Loading(),
      searchGeneration: Number.increment,
      search: () => SearchData.Idle(),
      maybeDocLayout: () => Option.none(),
      scrollTop: () => 0,
      maybeFlash: () => Option.none(),
    }),
    commands: [FetchDoc({ docId })],
  })

const refreshDocList = Update.refresh({
  read: (model: Model) => Option.some(model.docList),
  revalidate: AsyncData.revalidateOrLoad,
  write: (model, nextDocList) =>
    modifyFields(model, { docList: () => nextDocList }),
  load: FetchDocList(),
})

// SEARCH

const startSearch: Step = model => {
  const query = String.trim(model.query)
  const maybeDocId = pipe(
    AsyncData.getData(model.doc),
    Option.map(({ doc }) => doc.id),
    Option.filter(() => String.isNonEmpty(query)),
  )

  return Option.match(maybeDocId, {
    onNone: () => ({ model }),
    onSome: docId => {
      const nextGeneration = Number.increment(model.searchGeneration)
      return {
        model: modifyFields(model, {
          searchGeneration: () => nextGeneration,
          search: search =>
            Option.getOrElse(AsyncData.revalidateOrLoad(search), () => search),
        }),
        commands: [
          RunSearch({
            generation: nextGeneration,
            docId,
            query,
            mode: model.mode,
          }),
        ],
      }
    },
  })
}

const flashLine =
  (lineIndex: number): Step =>
  model => {
    const flashId = Number.increment(model.flashCount)
    return {
      model: modifyFields(model, {
        flashCount: () => flashId,
        maybeFlash: () => Option.some({ lineIndex, flashId }),
      }),
      commands: [
        ScrollLineIntoView({ lineIndex }),
        WaitBeforeUnflash({ flashId }),
      ],
    }
  }

const receiveSearchResult =
  (generation: number, result: Search.SearchResult): Step =>
  model => {
    if (generation !== model.searchGeneration) {
      return { model }
    }

    const withResult = modifyFields(model, {
      search: () => SearchData.Success({ data: result }),
    })
    const { isAbsent, topMatches } = Search.toHeatmap(result)

    return pipe(
      Array.head(topMatches),
      Option.filter(() => !isAbsent),
      Option.match({
        onNone: () => ({ model: withResult }),
        onSome: ({ lineIndex }) => flashLine(lineIndex)(withResult),
      }),
    )
  }

const foldModeRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Step,
  RadioGroup.OutMessage<Search.SearchMode>
>({
  Selected:
    ({ value }) =>
    model => {
      const withMode = modifyFields(model, { mode: () => value })
      return AsyncData.hasData(model.search)
        ? startSearch(withMode)
        : { model: withMode }
    },
})

const foldModeRadioGroup = Update.foldChild({
  update: ModeRadioGroup.update,
  read: (model: Model) => Option.some(model.modeRadioGroup),
  write: (model, nextModeRadioGroup) =>
    modifyFields(model, { modeRadioGroup: () => nextModeRadioGroup }),
  toParentMessage: message => Message.GotModeRadioGroupMessage({ message }),
  foldOutMessage: foldModeRadioGroupOutMessage,
})

// MINIMAP

const scrollToFraction =
  (fraction: number): Step =>
  model =>
    Option.match(model.maybeDocLayout, {
      onNone: () => ({ model }),
      onSome: layout => ({
        model,
        commands: [
          ScrollDocTo({ top: Layout.scrollTopAtFraction(layout, fraction) }),
        ],
      }),
    })

// PASTE

const foldPasteDialogOutMessage = Dialog.OutMessage.match<Step>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const pasteDialogFields = {
  read: (model: Model) => Option.some(model.pasteForm.dialog),
  write: (model: Model, nextDialog: Dialog.Model) =>
    modifyFields(model, {
      pasteForm: form => modifyFields(form, { dialog: () => nextDialog }),
    }),
  toParentMessage: (message: Dialog.Message) =>
    Message.GotPasteDialogMessage({ message }),
  foldOutMessage: foldPasteDialogOutMessage,
}

const foldPasteDialog = Update.foldChild({
  update: Dialog.update,
  ...pasteDialogFields,
})

const foldPasteDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  ...pasteDialogFields,
})

const foldPasteDialogClose = Update.foldChildStep({
  update: Dialog.close,
  ...pasteDialogFields,
})

const foldPasteKindRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Step,
  RadioGroup.OutMessage<PasteKind>
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        pasteForm: form => modifyFields(form, { kind: () => value }),
      }),
    }),
})

const foldPasteKindRadioGroup = Update.foldChild({
  update: PasteKindRadioGroup.update,
  read: (model: Model) => Option.some(model.pasteForm.kindRadioGroup),
  write: (model, nextKindRadioGroup) =>
    modifyFields(model, {
      pasteForm: form =>
        modifyFields(form, { kindRadioGroup: () => nextKindRadioGroup }),
    }),
  toParentMessage: message =>
    Message.GotPasteKindRadioGroupMessage({ message }),
  foldOutMessage: foldPasteKindRadioGroupOutMessage,
})

const submitPaste: Step = model => {
  const { title, text, kind, status } = model.pasteForm

  if (
    String.isEmpty(String.trim(text)) ||
    PasteStatus.guards.Submitting(status)
  ) {
    return { model }
  } else {
    return {
      model: modifyFields(model, {
        pasteForm: form =>
          modifyFields(form, { status: () => PasteStatus.Submitting() }),
      }),
      commands: [CreatePaste({ title, text, kind })],
    }
  }
}

const resetPasteForm =
  (maybeTruncatedLineCount: Option.Option<number>): Step =>
  model => ({
    model: modifyFields(model, {
      pasteForm: form =>
        modifyFields(form, {
          title: () => '',
          text: () => '',
          status: () =>
            Option.match(maybeTruncatedLineCount, {
              onNone: () => PasteStatus.Ready(),
              onSome: keptLineCount => PasteStatus.Truncated({ keptLineCount }),
            }),
        }),
    }),
  })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedStartSession: () => ({
      model: modifyFields(model, { docList: () => DocListData.Loading() }),
      commands: [FetchDocList()],
    }),

    SucceededFetchDocList: ({ docs }) => {
      const withDocs = modifyFields(model, {
        docList: () => DocListData.Success({ data: docs }),
      })
      return Option.match(pickDocId(model, docs), {
        onNone: () => ({ model: withDocs }),
        onSome: docId =>
          isOpenOrOpening(model, docId)
            ? { model: withDocs }
            : selectDoc(docId)(withDocs),
      })
    },

    FailedFetchDocList: ({ error }) => ({
      model: modifyFields(model, {
        docList: AsyncData.settle<ReadonlyArray<Doc.DocSummary>, string>(
          Result.fail(error),
        ),
      }),
    }),

    SelectedDoc: ({ docId }) => selectDoc(docId)(model),

    SucceededFetchDoc: ({ loadedDoc }) =>
      isSelected(model, loadedDoc.doc.id)
        ? {
            model: modifyFields(model, {
              doc: () => LoadedDocData.Success({ data: loadedDoc }),
            }),
          }
        : { model },

    FailedFetchDoc: ({ docId, error }) =>
      isSelected(model, docId)
        ? {
            model: modifyFields(model, {
              doc: AsyncData.settle<Doc.LoadedDoc, string>(Result.fail(error)),
            }),
          }
        : { model },

    UpdatedQuery: ({ value }) => ({
      model: modifyFields(model, { query: () => value }),
    }),

    SubmittedSearch: () => startSearch(model),

    ClickedSuggestion: ({ query }) =>
      startSearch(modifyFields(model, { query: () => query })),

    GotModeRadioGroupMessage: ({ message }) =>
      foldModeRadioGroup(model, message),

    SucceededRunSearch: ({ generation, result }) =>
      receiveSearchResult(generation, result)(model),

    FailedRunSearch: ({ generation, error }) =>
      generation === model.searchGeneration
        ? {
            model: modifyFields(model, {
              search: AsyncData.settle<Search.SearchResult, string>(
                Result.fail(error),
              ),
            }),
          }
        : { model },

    ClickedMatch: ({ lineIndex }) => flashLine(lineIndex)(model),

    CompletedScrollLineIntoView: () => ({ model }),

    CompletedWaitBeforeUnflash: ({ flashId }) => ({
      model: modifyFields(model, {
        maybeFlash: Option.filter(flash => flash.flashId !== flashId),
      }),
    }),

    MeasuredDocLayout: ({ layout }) => ({
      model: modifyFields(model, {
        maybeDocLayout: () => Option.some(layout),
      }),
    }),

    ScrolledDoc: ({ scrollTop }) => ({
      model: modifyFields(model, { scrollTop: () => scrollTop }),
    }),

    PressedMinimap: ({ fraction }) =>
      scrollToFraction(fraction)(
        modifyFields(model, { minimapDrag: () => MinimapDrag.Dragging() }),
      ),

    MovedMinimapPointer: ({ fraction }) =>
      MinimapDrag.match<UpdateReturn>(model.minimapDrag, {
        Released: () => ({ model }),
        Dragging: () => scrollToFraction(fraction)(model),
      }),

    ReleasedMinimap: () => ({
      model: modifyFields(model, {
        minimapDrag: () => MinimapDrag.Released(),
      }),
    }),

    CompletedScrollDocTo: () => ({ model }),

    ClickedOpenPaste: () => foldPasteDialogOpen(model),

    GotPasteDialogMessage: ({ message }) => foldPasteDialog(model, message),

    UpdatedPasteTitle: ({ value }) => ({
      model: modifyFields(model, {
        pasteForm: form => modifyFields(form, { title: () => value }),
      }),
    }),

    UpdatedPasteText: ({ value }) => ({
      model: modifyFields(model, {
        pasteForm: form => modifyFields(form, { text: () => value }),
      }),
    }),

    GotPasteKindRadioGroupMessage: ({ message }) =>
      foldPasteKindRadioGroup(model, message),

    SubmittedPaste: () => submitPaste(model),

    SucceededCreatePaste: ({ docId, maybeTruncatedLineCount }) =>
      Update.combine(model, [
        resetPasteForm(maybeTruncatedLineCount),
        foldPasteDialogClose,
        selectDoc(docId),
        refreshDocList,
      ]),

    FailedCreatePaste: ({ error }) => ({
      model: modifyFields(model, {
        pasteForm: form =>
          modifyFields(form, { status: () => PasteStatus.Failed({ error }) }),
      }),
    }),
  })
