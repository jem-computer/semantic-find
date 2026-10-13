import { Option } from 'effect'
import {
  Command,
  Mount,
  change,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { Dialog, RadioGroup } from '@foldkit/ui'

import {
  CreatePaste,
  FetchDoc,
  FetchDocList,
  RunSearch,
  ScrollLineIntoView,
  WaitBeforeUnflash,
} from './command'
import { update, view } from './main'
import { absentResult, answeredResult, loadedModel } from './main.fixture'
import { Message } from './message'
import { DocListData, LoadedDocData } from './model'
import { ObserveDocLayout } from './view/document'

const docLayout = {
  scrollHeight: 400,
  clientHeight: 200,
  lines: [
    { top: 0, height: 40 },
    { top: 50, height: 40 },
    { top: 100, height: 40 },
    { top: 150, height: 40 },
  ],
}

const measuredLayout = Mount.resolve(
  ObserveDocLayout,
  Message.MeasuredDocLayout({ layout: docLayout }),
)

const resolveFocusOption = Command.resolve(
  RadioGroup.FocusOption,
  RadioGroup.Message.CompletedFocusOption(),
)

describe('document', () => {
  test('renders the open document and its suggestions', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      expect(role('heading', { name: 'GitHub Terms of Service' })).toExist(),
      expect(text('You own content you create.')).toExist(),
      expect(
        role('button', { name: 'do I own the images I upload?' }),
      ).toExist(),
      expect(role('link', { name: 'GitHub, Inc.' })).toExist(),
    )
  })

  test('shows a loading state while the document loads', () => {
    scene(
      { update, view },
      given(modifyFields(loadedModel, { doc: () => LoadedDocData.Loading() })),
      expect(text('loading…')).toExist(),
    )
  })

  test('a document that fails to load shows the error', () => {
    scene(
      { update, view },
      given(
        modifyFields(loadedModel, {
          doc: () => LoadedDocData.Failure({ error: 'not found' }),
        }),
      ),
      expect(role('alert')).toHaveText(/couldn’t load document · not found/),
    )
  })

  test('a document list that fails to load shows the error', () => {
    scene(
      { update, view },
      given(
        modifyFields(loadedModel, {
          docList: () => DocListData.Failure({ error: 'offline' }),
        }),
      ),
      measuredLayout,
      expect(role('alert')).toHaveText(/couldn’t load documents · offline/),
    )
  })

  test('choosing another document loads it', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      expect(role('combobox', { name: 'document' })).toHaveValue('github-tos'),
      change(role('combobox', { name: 'document' }), 'incident-log'),
      Command.expectExact(FetchDoc({ docId: 'incident-log' })),
      Mount.expectEnded(ObserveDocLayout),
      expect(text('loading…')).toExist(),
      Command.resolve(
        FetchDoc,
        Message.FailedFetchDoc({ docId: 'incident-log', error: 'not found' }),
      ),
      expect(role('alert')).toHaveText(/not found/),
    )
  })
})

describe('search', () => {
  test('an answered search shows the verdict and top matches', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      click(role('button', { name: 'can I sue them in court?' })),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({ generation: 1, result: answeredResult }),
      ),
      Command.resolveAll(
        [ScrollLineIntoView, Message.CompletedScrollLineIntoView()],
        [WaitBeforeUnflash, Message.CompletedWaitBeforeUnflash({ flashId: 1 })],
      ),
      expect(role('status')).toHaveText(/answered in this document/),
      expect(role('status')).toHaveText(/choice mode/),
      inside(role('list'), expect(role('button', { name: /L001/ })).toExist()),
    )
  })

  test('an absent answer labels matches as closest lines', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      click(role('button', { name: 'can I sue them in court?' })),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({ generation: 1, result: absentResult }),
      ),
      expect(role('status')).toHaveText(/not in this document/),
      expect(text('closest lines · not answers')).toExist(),
    )
  })

  test('a failed search shows the error', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      click(role('button', { name: 'can I sue them in court?' })),
      Command.resolve(
        RunSearch,
        Message.FailedRunSearch({ generation: 1, error: 'bad query' }),
      ),
      expect(role('alert')).toHaveText(/request failed/),
      expect(role('alert')).toHaveText(/bad query/),
    )
  })

  test('switching to score mode re-runs the search', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      click(role('button', { name: 'can I sue them in court?' })),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({ generation: 1, result: absentResult }),
      ),
      click(role('radio', { name: 'score each line' })),
      resolveFocusOption,
      expect(role('radio', { name: 'score each line' })).toBeChecked(),
      Command.resolve(
        RunSearch,
        Message.SucceededRunSearch({
          generation: 2,
          result: { ...absentResult, mode: 'Score' },
        }),
      ),
      expect(role('status')).toHaveText(/score mode/),
    )
  })
})

const openPasteDialog = [
  click(role('button', { name: '+ paste your own' })),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(
    Dialog.AcquireResources,
    Dialog.Message.SucceededAcquireResources(),
  ),
] as const

describe('paste', () => {
  test('a rejected paste shows the server message in the dialog', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      ...openPasteDialog,
      expect(role('heading', { name: 'paste a document' })).toExist(),
      expect(
        text('private to this visit · deleted after 2 idle hours'),
      ).toExist(),
      type(label('title'), 'notes'),
      type(label('document text'), 'hello there'),
      submit(role('form', { name: 'paste a document' })),
      Command.expectExact(
        CreatePaste({ title: 'notes', text: 'hello there', kind: 'Auto' }),
      ),
      expect(text('adding…')).toExist(),
      Command.resolve(
        CreatePaste,
        Message.FailedCreatePaste({ error: 'document too large' }),
      ),
      expect(text('document too large')).toExist(),
    )
  })

  test('an accepted paste closes the dialog and opens the new document', () => {
    scene(
      { update, view },
      given(loadedModel),
      measuredLayout,
      ...openPasteDialog,
      type(label('document text'), 'hello there'),
      submit(role('form', { name: 'paste a document' })),
      Command.resolve(
        CreatePaste,
        Message.SucceededCreatePaste({
          docId: 'pasted-1',
          maybeTruncatedLineCount: Option.none(),
        }),
      ),
      Command.resolve(
        Dialog.CloseDialog,
        Dialog.Message.CompletedCloseDialog(),
      ),
      Mount.expectEnded(Dialog.AcquireResources, ObserveDocLayout),
      expect(role('heading', { name: 'paste a document' })).toBeAbsent(),
      expect(text('loading…')).toExist(),
      Command.resolveAll(
        [
          FetchDocList,
          Message.SucceededFetchDocList({
            docs: [{ id: 'pasted-1', title: 'notes', lineCount: 1 }],
          }),
        ],
        [
          FetchDoc,
          Message.SucceededFetchDoc({
            loadedDoc: {
              doc: {
                id: 'pasted-1',
                title: 'notes',
                source: 'pasted (this visit only)',
                maybeUrl: Option.none(),
                kind: 'Prose',
                lines: ['hello there'],
              },
              maybeCodeLanguage: Option.none(),
            },
          }),
        ],
      ),
      Mount.resolve(
        ObserveDocLayout,
        Message.MeasuredDocLayout({ layout: docLayout }),
      ),
      expect(role('heading', { name: 'notes' })).toExist(),
      expect(role('combobox', { name: 'document' })).toHaveValue('pasted-1'),
    )
  })
})
