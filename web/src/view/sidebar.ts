import { clsx } from 'clsx'
import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Button, Input, Select } from '@foldkit/ui'

import { Doc, Search, Suggestions } from '../domain'
import { DOC_SELECT_ID, QUERY_ID } from '../ids'
import { Message } from '../message'
import type { Model } from '../model'
import { ModeRadioGroup } from '../radioGroups'
import { externalLinkView } from './externalLink'
import { segmentedToggleView } from './toggle'

const SEARCH_MODES: ReadonlyArray<Search.SearchMode> = ['Choice', 'Score']

const MODE_LABELS: Record<Search.SearchMode, string> = {
  Choice: 'which line?',
  Score: 'score each line',
}

const MODE_NAMES: Record<Search.SearchMode, string> = {
  Choice: 'choice mode',
  Score: 'score mode',
}

const MODE_TITLES: Record<Search.SearchMode, string> = {
  Choice:
    'One Choice over all lines — scores are shares of one probability mass. Best for pinpointing.',
  Score:
    'One Score per line against a relevance rubric — absolute readings, nothing forced to win. Best for evidence chains.',
}

const VERDICT_LABELS: Record<Search.Verdict, string> = {
  Answered: 'answered in this document',
  Partial: 'partially addressed',
  Absent: 'not in this document',
}

const VERDICT_CLASSES: Record<Search.Verdict, string> = {
  Answered: 'found',
  Partial: 'partial',
  Absent: 'absent',
}

// BRAND

const brandView = (h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('brand')],
    [
      h.img([h.Src('/typesafe_logo.svg'), h.Alt('TypeSafe'), h.Class('logo')]),
      h.div([h.Class('app-name')], ['semantic find']),
    ],
  )

// DOCUMENT PICKER

const docOptionsView = (
  docs: ReadonlyArray<Doc.DocSummary>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.map(docs, summary =>
    h.keyed('option')(
      summary.id,
      [h.Value(summary.id)],
      [Doc.summaryLabel(summary)],
    ),
  )

const docPickerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Select.view(
    {
      id: DOC_SELECT_ID,
      value: Option.getOrElse(model.maybeSelectedDocId, () => ''),
      onChange: docId => Message.SelectedDoc({ docId }),
      toView: ({ select, label }) =>
        h.div(
          [],
          [
            h.label([...label, h.Class('field-label')], ['document']),
            h.div(
              [h.Class('select-wrap')],
              [
                h.select(
                  [...select, h.AriaBusy(AsyncData.isPending(model.docList))],
                  Option.match(AsyncData.getData(model.docList), {
                    onNone: () => [],
                    onSome: docs => docOptionsView(docs, h),
                  }),
                ),
              ],
            ),
          ],
        ),
    },
    h,
  )

const docListErrorView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getError(model.docList), {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [h.Class('verdict-meta'), h.Role('alert')],
        [`couldn’t load documents · ${error}`],
      ),
  })

const pasteOpenView = (h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedOpenPaste(),
      toView: ({ button }) =>
        h.button([...button, h.Class('paste-open')], ['+ paste your own']),
    },
    h,
  )

// SEARCH

const searchFormView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isSearching = AsyncData.isPending(model.search)

  return h.form(
    [h.Class('search-form'), h.OnSubmit(Message.SubmittedSearch())],
    [
      Input.view(
        {
          id: QUERY_ID,
          value: model.query,
          placeholder: 'do I own the images I upload?',
          onInput: value => Message.UpdatedQuery({ value }),
          toView: ({ label, input }) =>
            h.div(
              [],
              [
                h.label(
                  [...label, h.Class('field-label')],
                  ['ask the document'],
                ),
                h.div(
                  [
                    h.Class(clsx('search-box', { loading: isSearching })),
                    h.AriaBusy(isSearching),
                  ],
                  [
                    h.input([
                      ...input,
                      h.Autocomplete('off'),
                      h.Spellcheck(false),
                    ]),
                    Button.view(
                      {
                        type: 'submit',
                        isDisabled: isSearching,
                        toView: ({ button }) =>
                          h.button([...button, h.AriaLabel('search')], ['→']),
                      },
                      h,
                    ),
                  ],
                ),
              ],
            ),
        },
        h,
      ),
    ],
  )
}

const modeToggleView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.modeRadioGroup.id,
    model: model.modeRadioGroup,
    view: ModeRadioGroup.view,
    viewInputs: {
      options: SEARCH_MODES,
      selectedValue: Option.some(model.mode),
      ariaLabel: 'search mode',
      orientation: 'Horizontal',
      toView: segmentedToggleView(
        { labels: MODE_LABELS, titles: MODE_TITLES, className: '' },
        h,
      ),
    },
    toParentMessage: message => Message.GotModeRadioGroupMessage({ message }),
  })

const suggestionsView = (docId: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('suggestions')],
    Array.map(Suggestions.suggestionsFor(docId), query =>
      Button.view(
        {
          onClick: Message.ClickedSuggestion({ query }),
          toView: ({ button }) =>
            h.keyed('button')(query, [...button], [query]),
        },
        h,
      ),
    ),
  )

// RESULTS

const verdictView = (
  { exists, elapsedMs, inputTokens, mode }: Search.SearchResult,
  { verdict }: Search.Heatmap,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('verdict'), h.Role('status')],
    [
      h.div(
        [h.Class(clsx('verdict-chip', VERDICT_CLASSES[verdict]))],
        [VERDICT_LABELS[verdict]],
      ),
      h.div(
        [h.Class('verdict-meta')],
        [
          'exists ',
          h.b([], [exists.toFixed(2)]),
          ' · ',
          h.b([], [`${elapsedMs}ms`]),
          ` · ${inputTokens.toLocaleString()} tokens in · ${MODE_NAMES[mode]}`,
        ],
      ),
    ],
  )

const failedSearchView = (error: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('verdict'), h.Role('alert')],
    [
      h.div([h.Class('verdict-chip absent')], ['request failed']),
      h.div([h.Class('verdict-meta')], [error]),
    ],
  )

const topMatchView = (
  lines: ReadonlyArray<string>,
  { lineIndex, badge, barPercent }: Search.TopMatch,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    Doc.lineId(lineIndex),
    [],
    [
      Button.view(
        {
          onClick: Message.ClickedMatch({ lineIndex }),
          toView: ({ button }) =>
            h.button(
              [...button],
              [
                h.span(
                  [h.Class('m-head')],
                  [
                    h.span([h.Class('m-line')], [Doc.lineId(lineIndex)]),
                    h.span([h.Class('m-score')], [badge]),
                  ],
                ),
                h.span(
                  [h.Class('m-bar')],
                  [h.i([h.Style({ width: `${barPercent}%` })])],
                ),
                h.span(
                  [h.Class('m-text')],
                  [
                    Option.match(Array.get(lines, lineIndex), {
                      onNone: () => '',
                      onSome: Doc.matchExcerpt,
                    }),
                  ],
                ),
              ],
            ),
        },
        h,
      ),
    ],
  )

const topMatchesView = (
  lines: ReadonlyArray<string>,
  { isAbsent, topMatches }: Search.Heatmap,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(topMatches, {
    onEmpty: () => h.empty,
    onNonEmpty: matches =>
      h.div(
        [h.Class('matches')],
        [
          h.div(
            [h.Class('field-label')],
            [isAbsent ? 'closest lines · not answers' : 'top matches'],
          ),
          h.ol(
            [],
            Array.map(matches, match => topMatchView(lines, match, h)),
          ),
        ],
      ),
  })

const resultsView = (
  model: Model,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  { doc }: Doc.LoadedDoc,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const errorViews = Option.match(AsyncData.getError(model.search), {
    onNone: () => [],
    onSome: error => [failedSearchView(error, h)],
  })
  const resultViews = Option.match(
    Option.all({
      result: AsyncData.getData(model.search),
      heatmap: maybeHeatmap,
    }),
    {
      onNone: () => [],
      onSome: ({ result, heatmap }) => [
        verdictView(result, heatmap, h),
        topMatchesView(doc.lines, heatmap, h),
      ],
    },
  )
  return [...errorViews, ...resultViews]
}

// FOOTER

const sourceView = (
  { doc, maybeCodeLanguage }: Doc.LoadedDoc,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [],
    [
      'source: ',
      Option.match(doc.maybeUrl, {
        onNone: () => doc.source,
        onSome: url => externalLinkView(url, doc.source, h),
      }),
      Option.match(maybeCodeLanguage, {
        onNone: () => '',
        onSome: language => ` · detected ${language}`,
      }),
    ],
  )

const footerView = (
  maybeLoadedDoc: Option.Option<Doc.LoadedDoc>,
  h: HtmlBuilder<Message>,
): Html =>
  h.footer(
    [h.Class('sidebar-foot')],
    [
      Option.match(maybeLoadedDoc, {
        onNone: () => h.empty,
        onSome: loadedDoc => sourceView(loadedDoc, h),
      }),
      h.span(
        [],
        [
          'one request · whole document ·',
          h.br([]),
          '“which line?” + “does one exist?”',
        ],
      ),
    ],
  )

// SIDEBAR

export const sidebarView = (
  model: Model,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  h: HtmlBuilder<Message>,
): Html => {
  const maybeLoadedDoc = AsyncData.getData(model.doc)

  return h.aside(
    [h.Class('sidebar')],
    [
      brandView(h),
      docPickerView(model, h),
      docListErrorView(model, h),
      pasteOpenView(h),
      searchFormView(model, h),
      modeToggleView(model, h),
      Option.match(model.maybeSelectedDocId, {
        onNone: () => h.empty,
        onSome: docId => suggestionsView(docId, h),
      }),
      ...Option.match(maybeLoadedDoc, {
        onNone: () => [],
        onSome: loadedDoc => resultsView(model, maybeHeatmap, loadedDoc, h),
      }),
      footerView(maybeLoadedDoc, h),
    ],
  )
}
