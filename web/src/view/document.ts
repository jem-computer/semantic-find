import { clsx } from 'clsx'
import { Array, Effect, Option, Queue, Stream } from 'effect'
import { AsyncData, Mount } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { type Doc, type Layout, Search } from '../domain'
import { DOC_SCROLL_ID } from '../ids'
import { Message } from '../message'
import type { Model } from '../model'
import { memoLineView } from './line'
import { minimapView } from './minimap'

// MOUNT

const measureLayout = (scroller: HTMLElement): Layout.DocLayout => {
  const scrollerTop = scroller.getBoundingClientRect().top - scroller.scrollTop
  return {
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    lines: Array.map(
      Array.fromIterable(scroller.querySelectorAll('.doc-line')),
      line => {
        const { top, height } = line.getBoundingClientRect()
        return { top: top - scrollerTop, height }
      },
    ),
  }
}

const observeLayout = (element: Element) => {
  if (!(element instanceof HTMLElement)) {
    return Stream.empty
  }

  return Stream.callback<typeof Message.MeasuredDocLayout.Type>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const emit = () =>
          Queue.offerUnsafe(
            queue,
            Message.MeasuredDocLayout({ layout: measureLayout(element) }),
          )
        const observer = new ResizeObserver(emit)
        observer.observe(element)
        Array.forEach(Array.fromIterable(element.children), child =>
          observer.observe(child),
        )
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )
}

export const ObserveDocLayout = Mount.defineStream('ObserveDocLayout', {
  messages: [Message.MeasuredDocLayout],
  execute: ({ element }) => observeLayout(element),
})

// VIEW

const NO_HEAT: Search.LineHeat = { heat: 0, isHot: false, badge: '' }

const docLinesView = (
  { doc, maybeCodeLanguage }: Doc.LoadedDoc,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  maybeFlash: Model['maybeFlash'],
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.map(doc.lines, (text, lineIndex) => {
    const { heat, isHot, badge } = Option.getOrElse(
      Option.flatMap(maybeHeatmap, ({ lines }) => Array.get(lines, lineIndex)),
      () => NO_HEAT,
    )
    return memoLineView(
      {
        lineIndex,
        text,
        kind: doc.kind,
        maybeCodeLanguage,
        heat,
        isHot,
        badge,
        isFlashed: Option.exists(
          maybeFlash,
          flash => flash.lineIndex === lineIndex,
        ),
      },
      h,
    )
  })

const loadedDocView = (
  model: Model,
  loadedDoc: Doc.LoadedDoc,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  h: HtmlBuilder<Message>,
): Html => {
  const { doc } = loadedDoc

  return h.keyed('div')(
    doc.id,
    [
      h.Id(DOC_SCROLL_ID),
      h.Class('doc-scroll'),
      h.OnScroll(scrollTop => Message.ScrolledDoc({ scrollTop })),
      h.OnMount(ObserveDocLayout()),
    ],
    [
      h.article(
        [
          h.Class(
            clsx('doc', {
              'kind-log': doc.kind === 'Log',
              'kind-code': doc.kind === 'Code',
              dimmed: Option.exists(maybeHeatmap, ({ isAbsent }) => isAbsent),
            }),
          ),
        ],
        [
          h.h1([], [doc.title]),
          h.div([], docLinesView(loadedDoc, maybeHeatmap, model.maybeFlash, h)),
        ],
      ),
    ],
  )
}

const loadingView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('doc-scroll'), h.AriaBusy(true)],
    [h.article([h.Class('doc')], [h.p([h.Class('doc-status')], ['loading…'])])],
  )

const failedView = (error: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('doc-scroll')],
    [
      h.article(
        [h.Class('doc')],
        [
          h.p(
            [h.Class('doc-status'), h.Role('alert')],
            [`couldn’t load document · ${error}`],
          ),
        ],
      ),
    ],
  )

export const documentPaneView = (
  model: Model,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  h: HtmlBuilder<Message>,
): Html =>
  h.main(
    [h.Class('doc-pane')],
    [
      AsyncData.match(model.doc, {
        onIdle: () => loadingView(h),
        onLoading: () => loadingView(h),
        onRefreshing: loadedDoc =>
          loadedDocView(model, loadedDoc, maybeHeatmap, h),
        onFailure: error => failedView(error, h),
        onStale: ({ data }) => loadedDocView(model, data, maybeHeatmap, h),
        onSuccess: loadedDoc =>
          loadedDocView(model, loadedDoc, maybeHeatmap, h),
      }),
      minimapView(model, maybeHeatmap, h),
    ],
  )
