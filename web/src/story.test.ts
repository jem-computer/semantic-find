import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { RadioGroup } from '@foldkit/ui'

import {
  CreatePaste,
  FetchDoc,
  FetchDocList,
  RunSearch,
  ScrollDocTo,
  ScrollLineIntoView,
  WaitBeforeUnflash,
} from './command'
import { initialModel, update } from './main'
import {
  absentResult,
  answeredResult,
  docSummaries,
  loadedModel,
  loadedTerms,
  termsDoc,
} from './main.fixture'
import { Message } from './message'
import { DocListData, MinimapDrag, PasteStatus, SearchData } from './model'

const withQuery = modifyFields(loadedModel, {
  query: () => 'who owns my content?',
})

const withAnsweredSearch = modifyFields(withQuery, {
  searchGeneration: () => 1,
  search: () => SearchData.Success({ data: answeredResult }),
})

const pastedSummary = { id: 'pasted-1', title: 'notes', lineCount: 1 }

describe('loading documents', () => {
  test('a started session loads the list, then the default document', () => {
    story(
      update,
      given(initialModel),
      message(Message.CompletedStartSession()),
      Command.expectExact(FetchDocList()),
      model(model => {
        expect(AsyncData.isLoading(model.docList)).toBe(true)
      }),
      Command.resolveAll(
        [FetchDocList, Message.SucceededFetchDocList({ docs: docSummaries })],
        [FetchDoc, Message.SucceededFetchDoc({ loadedDoc: loadedTerms })],
      ),
      model(model => {
        expect(model.maybeSelectedDocId).toEqual(Option.some('github-tos'))
        expect(AsyncData.getData(model.doc)).toEqual(Option.some(loadedTerms))
      }),
    )
  })

  test('the first document opens when the default is missing', () => {
    story(
      update,
      given(initialModel),
      message(
        Message.SucceededFetchDocList({
          docs: docSummaries.filter(({ id }) => id !== 'github-tos'),
        }),
      ),
      Command.expectExact(FetchDoc({ docId: 'incident-log' })),
      Command.resolve(
        FetchDoc,
        Message.FailedFetchDoc({ docId: 'incident-log', error: 'not found' }),
      ),
      model(model => {
        expect(AsyncData.getError(model.doc)).toEqual(Option.some('not found'))
      }),
    )
  })

  test('a failed list load records the error', () => {
    story(
      update,
      given(initialModel),
      message(Message.CompletedStartSession()),
      Command.resolve(
        FetchDocList,
        Message.FailedFetchDocList({ error: 'offline' }),
      ),
      model(model => {
        expect(AsyncData.isFailure(model.docList)).toBe(true)
        expect(AsyncData.getError(model.docList)).toEqual(
          Option.some('offline'),
        )
      }),
    )
  })

  test('a failed list refresh keeps the documents it had', () => {
    story(
      update,
      given(
        modifyFields(loadedModel, {
          docList: () => DocListData.Refreshing({ data: docSummaries }),
        }),
      ),
      message(Message.FailedFetchDocList({ error: 'offline' })),
      model(model => {
        expect(AsyncData.isStale(model.docList)).toBe(true)
        expect(AsyncData.getData(model.docList)).toEqual(
          Option.some(docSummaries),
        )
      }),
    )
  })

  test('a document that arrives after another was selected is ignored', () => {
    story(
      update,
      given(initialModel),
      message(Message.SelectedDoc({ docId: 'incident-log' })),
      Command.resolve(
        FetchDoc({ docId: 'incident-log' }),
        Message.SucceededFetchDoc({ loadedDoc: loadedTerms }),
      ),
      model(model => {
        expect(AsyncData.isLoading(model.doc)).toBe(true)
      }),
    )
  })

  test('selecting a document clears the previous search', () => {
    story(
      update,
      given(withAnsweredSearch),
      message(Message.SelectedDoc({ docId: 'incident-log' })),
      Command.expectExact(FetchDoc({ docId: 'incident-log' })),
      model(model => {
        expect(AsyncData.isIdle(model.search)).toBe(true)
        expect(model.searchGeneration).toBe(2)
      }),
      Command.resolve(
        FetchDoc,
        Message.FailedFetchDoc({ docId: 'incident-log', error: 'not found' }),
      ),
    )
  })
})

describe('searching', () => {
  test('a blank query does nothing', () => {
    story(
      update,
      given(modifyFields(loadedModel, { query: () => '   ' })),
      message(Message.SubmittedSearch()),
      Command.expectNone(),
    )
  })

  test('submitting runs one search over the open document', () => {
    story(
      update,
      given(withQuery),
      message(Message.SubmittedSearch()),
      Command.expectExact(
        RunSearch({
          generation: 1,
          docId: termsDoc.id,
          query: 'who owns my content?',
          mode: 'Choice',
        }),
      ),
      model(model => {
        expect(AsyncData.isLoading(model.search)).toBe(true)
      }),
      Command.resolve(
        RunSearch,
        Message.FailedRunSearch({ generation: 1, error: 'bad query' }),
      ),
      model(model => {
        expect(AsyncData.getError(model.search)).toEqual(
          Option.some('bad query'),
        )
      }),
    )
  })

  test('a suggestion fills the query and searches', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedSuggestion({ query: 'can I sue them?' })),
      Command.expectHas(RunSearch),
      model(model => {
        expect(model.query).toBe('can I sue them?')
      }),
      Command.resolve(
        RunSearch,
        Message.FailedRunSearch({ generation: 1, error: 'bad query' }),
      ),
    )
  })

  test('an answered search jumps to and flashes the top match', () => {
    story(
      update,
      given(withQuery),
      message(Message.SubmittedSearch()),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({ generation: 1, result: answeredResult }),
      ),
      Command.expectExact(
        ScrollLineIntoView({ lineIndex: 1 }),
        WaitBeforeUnflash({ flashId: 1 }),
      ),
      model(model => {
        expect(model.maybeFlash).toEqual(
          Option.some({ lineIndex: 1, flashId: 1 }),
        )
      }),
      Command.resolveAll(
        [ScrollLineIntoView, Message.CompletedScrollLineIntoView()],
        [WaitBeforeUnflash, Message.CompletedWaitBeforeUnflash({ flashId: 1 })],
      ),
      model(model => {
        expect(model.maybeFlash).toEqual(Option.none())
      }),
    )
  })

  test('an absent answer does not jump', () => {
    story(
      update,
      given(withQuery),
      message(Message.SubmittedSearch()),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({ generation: 1, result: absentResult }),
      ),
      Command.expectNone(),
      model(model => {
        expect(model.maybeFlash).toEqual(Option.none())
      }),
    )
  })

  test('a superseded search result is ignored', () => {
    story(
      update,
      given(
        modifyFields(withQuery, {
          searchGeneration: () => 2,
          search: () => SearchData.Loading(),
        }),
      ),
      message(
        Message.SucceededRunSearch({ generation: 1, result: answeredResult }),
      ),
      Command.expectNone(),
      model(model => {
        expect(AsyncData.isLoading(model.search)).toBe(true)
      }),
    )
  })

  test('changing mode re-runs the search and keeps the old heat until it lands', () => {
    story(
      update,
      given(withAnsweredSearch),
      message(
        Message.GotModeRadioGroupMessage({
          message: RadioGroup.Message.SelectedOption({
            index: 1,
            value: 'Score',
          }),
        }),
      ),
      Command.expectHas(
        RunSearch({
          generation: 2,
          docId: termsDoc.id,
          query: 'who owns my content?',
          mode: 'Score',
        }),
      ),
      model(model => {
        expect(model.mode).toBe('Score')
        expect(AsyncData.isRefreshing(model.search)).toBe(true)
      }),
      Command.resolveAll(
        [RadioGroup.FocusOption, RadioGroup.Message.CompletedFocusOption()],
        [
          RunSearch,
          Message.FailedRunSearch({ generation: 2, error: 'rate limited' }),
        ],
      ),
      model(model => {
        expect(AsyncData.isStale(model.search)).toBe(true)
        expect(AsyncData.getData(model.search)).toEqual(
          Option.some(answeredResult),
        )
      }),
    )
  })

  test('changing mode before any search does not search', () => {
    story(
      update,
      given(withQuery),
      message(
        Message.GotModeRadioGroupMessage({
          message: RadioGroup.Message.SelectedOption({
            index: 1,
            value: 'Score',
          }),
        }),
      ),
      model(model => {
        expect(model.mode).toBe('Score')
      }),
      Command.expectExact(RadioGroup.FocusOption),
      Command.resolve(
        RadioGroup.FocusOption,
        RadioGroup.Message.CompletedFocusOption(),
      ),
    )
  })

  test('each flash clears when its own timer ends', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedMatch({ lineIndex: 2 })),
      Command.resolveAll(
        [ScrollLineIntoView, Message.CompletedScrollLineIntoView()],
        [WaitBeforeUnflash, Message.CompletedWaitBeforeUnflash({ flashId: 1 })],
      ),
      model(model => {
        expect(model.maybeFlash).toEqual(Option.none())
      }),
      message(Message.ClickedMatch({ lineIndex: 2 })),
      Command.resolveAll(
        [ScrollLineIntoView, Message.CompletedScrollLineIntoView()],
        [WaitBeforeUnflash, Message.CompletedWaitBeforeUnflash({ flashId: 2 })],
      ),
      message(Message.ClickedMatch({ lineIndex: 2 })),
      Command.resolve(
        ScrollLineIntoView,
        Message.CompletedScrollLineIntoView(),
      ),
      Command.resolve(
        WaitBeforeUnflash({ flashId: 3 }),
        Message.CompletedWaitBeforeUnflash({ flashId: 3 }),
      ),
      model(model => {
        expect(model.maybeFlash).toEqual(Option.none())
      }),
    )
  })

  test('an earlier flash timer does not clear a newer flash', () => {
    story(
      update,
      given(
        modifyFields(loadedModel, {
          flashCount: () => 2,
          maybeFlash: () => Option.some({ lineIndex: 2, flashId: 2 }),
        }),
      ),
      message(Message.CompletedWaitBeforeUnflash({ flashId: 1 })),
      model(model => {
        expect(model.maybeFlash).toEqual(
          Option.some({ lineIndex: 2, flashId: 2 }),
        )
      }),
      message(Message.CompletedWaitBeforeUnflash({ flashId: 2 })),
      model(model => {
        expect(model.maybeFlash).toEqual(Option.none())
      }),
    )
  })
})

describe('minimap', () => {
  const withLayout = modifyFields(loadedModel, {
    maybeDocLayout: () =>
      Option.some({ scrollHeight: 4000, clientHeight: 1000, lines: [] }),
  })

  test('pressing centres the document on that point and starts a drag', () => {
    story(
      update,
      given(withLayout),
      message(Message.PressedMinimap({ fraction: 0.75 })),
      Command.expectExact(ScrollDocTo({ top: 2500 })),
      model(model => {
        expect(model.minimapDrag).toEqual(MinimapDrag.Dragging())
      }),
      Command.resolve(ScrollDocTo, Message.CompletedScrollDocTo()),
      message(Message.MovedMinimapPointer({ fraction: 0.5 })),
      Command.expectExact(ScrollDocTo({ top: 1500 })),
      Command.resolve(ScrollDocTo, Message.CompletedScrollDocTo()),
      message(Message.ReleasedMinimap()),
      model(model => {
        expect(model.minimapDrag).toEqual(MinimapDrag.Released())
      }),
    )
  })

  test('pointer moves without a drag do nothing', () => {
    story(
      update,
      given(withLayout),
      message(Message.MovedMinimapPointer({ fraction: 0.5 })),
      Command.expectNone(),
    )
  })

  test('pressing before the document is measured does not scroll', () => {
    story(
      update,
      given(loadedModel),
      message(Message.PressedMinimap({ fraction: 0.5 })),
      Command.expectNone(),
    )
  })
})

describe('pasting', () => {
  test('blank text is not submitted', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedPasteText({ value: '  \n ' })),
      message(Message.SubmittedPaste()),
      Command.expectNone(),
    )
  })

  test('submitting sends the chosen kind', () => {
    story(
      update,
      given(loadedModel),
      message(
        Message.GotPasteKindRadioGroupMessage({
          message: RadioGroup.Message.SelectedOption({
            index: 1,
            value: 'Code',
          }),
        }),
      ),
      Command.resolve(
        RadioGroup.FocusOption,
        RadioGroup.Message.CompletedFocusOption(),
      ),
      message(Message.UpdatedPasteTitle({ value: 'notes' })),
      message(Message.UpdatedPasteText({ value: 'def f(): pass' })),
      message(Message.SubmittedPaste()),
      Command.expectExact(
        CreatePaste({ title: 'notes', text: 'def f(): pass', kind: 'Code' }),
      ),
      model(model => {
        expect(model.pasteForm.status).toEqual(PasteStatus.Submitting())
      }),
      Command.resolve(
        CreatePaste,
        Message.FailedCreatePaste({ error: 'document too large' }),
      ),
      model(model => {
        expect(model.pasteForm.status).toEqual(
          PasteStatus.Failed({ error: 'document too large' }),
        )
      }),
    )
  })

  test('a created paste opens once, even when the list arrives first', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedPasteText({ value: 'hello' })),
      message(Message.SubmittedPaste()),
      Command.resolve(
        CreatePaste,
        Message.SucceededCreatePaste({
          docId: 'pasted-1',
          maybeTruncatedLineCount: Option.some(240),
        }),
      ),
      Command.expectExact(FetchDocList(), FetchDoc({ docId: 'pasted-1' })),
      model(model => {
        expect(model.maybeSelectedDocId).toEqual(Option.some('pasted-1'))
        expect(AsyncData.isRefreshing(model.docList)).toBe(true)
        expect(model.pasteForm.text).toBe('')
        expect(model.pasteForm.status).toEqual(
          PasteStatus.Truncated({ keptLineCount: 240 }),
        )
      }),
      Command.resolve(
        FetchDocList,
        Message.SucceededFetchDocList({
          docs: [...docSummaries, pastedSummary],
        }),
      ),
      Command.expectExact(FetchDoc({ docId: 'pasted-1' })),
      model(model => {
        expect(model.searchGeneration).toBe(1)
      }),
      Command.resolve(
        FetchDoc,
        Message.FailedFetchDoc({ docId: 'pasted-1', error: 'gone' }),
      ),
    )
  })
})
