import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Button, Input, Select } from '@foldkit/ui'
import { Style, Var } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Doc, Search, Suggestions } from '../domain'
import { DOC_SELECT_ID, QUERY_ID } from '../ids'
import { Message } from '../message'
import type { Model } from '../model'
import { ModeRadioGroup } from '../radioGroups'
import * as SidebarStyle from '../style/sidebar'
import { fieldLabel, metaEmphasis, metaText } from '../style/theme'
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

// BRAND

const brandView = (h: HtmlBuilder<Message>): Html =>
  h.header(
    [...css(SidebarStyle.brand)],
    [
      h.img([
        h.Src('/typesafe_logo.svg'),
        h.Alt('TypeSafe'),
        ...css(SidebarStyle.logo),
      ]),
      h.div([...css(SidebarStyle.appName)], ['semantic find']),
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
            h.label([...label, ...css(fieldLabel)], ['document']),
            h.div(
              [],
              [
                h.select(
                  [
                    ...select,
                    ...css(SidebarStyle.docSelect),
                    h.AriaBusy(AsyncData.isPending(model.docList)),
                  ],
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
        [...css(metaText), h.Role('alert')],
        [`couldn’t load documents · ${error}`],
      ),
  })

const pasteOpenView = (h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedOpenPaste(),
      toView: ({ button }) =>
        h.button(
          [...button, ...css(SidebarStyle.pasteOpen)],
          ['+ paste your own'],
        ),
    },
    h,
  )

// SEARCH

const searchFormView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isSearching = AsyncData.isPending(model.search)

  return h.form(
    [...css(SidebarStyle.searchForm), h.OnSubmit(Message.SubmittedSearch())],
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
                h.label([...label, ...css(fieldLabel)], ['ask the document']),
                h.div(
                  [...css(SidebarStyle.searchBox), h.AriaBusy(isSearching)],
                  [
                    h.input([
                      ...input,
                      ...css(SidebarStyle.queryInput),
                      h.Autocomplete('off'),
                      h.Spellcheck(false),
                    ]),
                    Button.view(
                      {
                        type: 'submit',
                        isDisabled: isSearching,
                        toView: ({ button }) =>
                          h.button(
                            [
                              ...button,
                              ...css(
                                SidebarStyle.searchButton({ isSearching }),
                              ),
                              h.AriaLabel('search'),
                            ],
                            ['→'],
                          ),
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
        { labels: MODE_LABELS, titles: MODE_TITLES, groupStyle: Style.empty },
        h,
      ),
    },
    toParentMessage: message => Message.GotModeRadioGroupMessage({ message }),
  })

const suggestionsView = (docId: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(SidebarStyle.suggestions)],
    Array.map(Suggestions.suggestionsFor(docId), query =>
      Button.view(
        {
          onClick: Message.ClickedSuggestion({ query }),
          toView: ({ button }) =>
            h.keyed('button')(
              query,
              [...button, ...css(SidebarStyle.suggestion)],
              [query],
            ),
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
    [...css(SidebarStyle.verdict), h.Role('status')],
    [
      h.div(
        [...css(SidebarStyle.verdictChip({ verdict }))],
        [VERDICT_LABELS[verdict]],
      ),
      h.div(
        [...css(metaText)],
        [
          'exists ',
          h.b([...css(metaEmphasis)], [exists.toFixed(2)]),
          ' · ',
          h.b([...css(metaEmphasis)], [`${elapsedMs}ms`]),
          ` · ${inputTokens.toLocaleString()} tokens in · ${MODE_NAMES[mode]}`,
        ],
      ),
    ],
  )

const failedSearchView = (error: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(SidebarStyle.verdict), h.Role('alert')],
    [
      h.div(
        [...css(SidebarStyle.verdictChip({ verdict: 'Absent' }))],
        ['request failed'],
      ),
      h.div([...css(metaText)], [error]),
    ],
  )

const topMatchView = (
  lines: ReadonlyArray<string>,
  { lineIndex, badge, barPercent }: Search.TopMatch,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    Doc.lineId(lineIndex),
    [...css(SidebarStyle.matchItem)],
    [
      Button.view(
        {
          onClick: Message.ClickedMatch({ lineIndex }),
          toView: ({ button }) =>
            h.button(
              [...button, ...css(SidebarStyle.matchButton)],
              [
                h.span(
                  [...css(SidebarStyle.matchHead)],
                  [
                    h.span(
                      [...css(SidebarStyle.matchLine)],
                      [Doc.lineId(lineIndex)],
                    ),
                    h.span([...css(SidebarStyle.matchScore)], [badge]),
                  ],
                ),
                h.span(
                  [...css(SidebarStyle.matchBar)],
                  [
                    h.i([
                      ...css(
                        SidebarStyle.matchBarFill,
                        Var.bind(SidebarStyle.barPercent, barPercent),
                      ),
                    ]),
                  ],
                ),
                h.span(
                  [...css(SidebarStyle.matchText)],
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
        [],
        [
          h.div(
            [...css(fieldLabel)],
            [isAbsent ? 'closest lines · not answers' : 'top matches'],
          ),
          h.ol(
            [...css(SidebarStyle.matchList)],
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
    [...css(SidebarStyle.footer)],
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
      creditView(h),
    ],
  )

const creditView = (h: HtmlBuilder<Message>): Html =>
  h.span(
    [],
    [
      'based on an example by ',
      externalLinkView('https://typesafe.ai', 'TypeSafe', h),
      ' / ',
      externalLinkView('https://x.com/allietheicon', '@allietheicon', h),
      ',',
      h.br([]),
      'adapted to the CAFE stack (Cloudflare, Alchemy, Foldkit, Effect)',
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
    [...css(SidebarStyle.sidebar, ...SidebarStyle.pinkSurfaceBindings)],
    [
      h.div(
        [...css(SidebarStyle.controls)],
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
        ],
      ),
      footerView(maybeLoadedDoc, h),
    ],
  )
}
