import { Array, Option, pipe } from 'effect'
import { AsyncData, Canvas } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Var } from '@pleat/core'
import { css, cssClass } from '@pleat/foldkit'

import { Layout, type Search } from '../domain'
import { MINIMAP_ID } from '../ids'
import { Message } from '../message'
import type { Model } from '../model'
import * as MinimapStyle from '../style/minimap'
import { nearBlack, neonPink } from '../style/theme'

const CANVAS_WIDTH = 120
const CANVAS_HEIGHT = 1200
const PADDING = 9
const MIN_LINE_HEIGHT = 1.5
const LINE_GAP = 0.75
const HEAT_BLEED = 0.5
const DENSITY_FULL_LENGTH = 560
const DENSITY_FILL = nearBlack(0.16)
const HEAT_ALPHA = 0.9
const DIMMED_HEAT_ALPHA = 0.25

const lineShapes = (
  { scrollHeight, lines }: Layout.DocLayout,
  texts: ReadonlyArray<string>,
  maybeHeatmap: Option.Option<Search.Heatmap>,
): ReadonlyArray<Canvas.Shape> => {
  const scale = CANVAS_HEIGHT / scrollHeight
  const heatAlpha = Option.exists(maybeHeatmap, ({ isAbsent }) => isAbsent)
    ? DIMMED_HEAT_ALPHA
    : HEAT_ALPHA

  return Array.flatMap(lines, ({ top, height }, lineIndex) => {
    const y = top * scale
    const rowHeight = Math.max(MIN_LINE_HEIGHT, height * scale - LINE_GAP)
    const textLength = Option.match(Array.get(texts, lineIndex), {
      onNone: () => 0,
      onSome: text => text.length,
    })
    const densityShape = Canvas.Rect({
      x: PADDING,
      y,
      width:
        Math.min(1, textLength / DENSITY_FULL_LENGTH) *
        (CANVAS_WIDTH - PADDING * 2),
      height: rowHeight,
      fill: DENSITY_FILL,
    })
    const maybeHeatShape = pipe(
      maybeHeatmap,
      Option.flatMap(({ lines: lineHeats }) => Array.get(lineHeats, lineIndex)),
      Option.filter(({ heat }) => heat > 0),
      Option.map(({ heat }) =>
        Canvas.Rect({
          x: 0,
          y: y - HEAT_BLEED,
          width: CANVAS_WIDTH,
          height: rowHeight + HEAT_BLEED * 2,
          fill: neonPink(heat * heatAlpha),
        }),
      ),
    )
    return [densityShape, ...Option.toArray(maybeHeatShape)]
  })
}

const viewportView = (
  layout: Layout.DocLayout,
  scrollTop: number,
  h: HtmlBuilder<Message>,
): Html => {
  const { topFraction, heightFraction } = Layout.viewportBox(layout, scrollTop)
  return h.div([
    ...css(
      MinimapStyle.viewport,
      Var.bind(MinimapStyle.viewportTop, topFraction),
      Var.bind(MinimapStyle.viewportHeight, heightFraction),
    ),
  ])
}

export const minimapView = (
  model: Model,
  maybeHeatmap: Option.Option<Search.Heatmap>,
  h: HtmlBuilder<Message>,
): Html => {
  const maybeLayout = Option.filter(
    model.maybeDocLayout,
    ({ scrollHeight }) => scrollHeight > 0,
  )
  const maybeTexts = Option.map(
    AsyncData.getData(model.doc),
    ({ doc }) => doc.lines,
  )

  return h.div(
    [h.Id(MINIMAP_ID), ...css(MinimapStyle.minimap), h.AriaHidden(true)],
    [
      Canvas.view(
        {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          className: cssClass(MinimapStyle.canvas),
          shapes: Option.match(
            Option.all({ layout: maybeLayout, texts: maybeTexts }),
            {
              onNone: () => [],
              onSome: ({ layout, texts }) =>
                lineShapes(layout, texts, maybeHeatmap),
            },
          ),
          onPointerDown: ({ y }) =>
            Message.PressedMinimap({ fraction: y / CANVAS_HEIGHT }),
        },
        h,
      ),
      Option.match(maybeLayout, {
        onNone: () => h.empty,
        onSome: layout => viewportView(layout, model.scrollTop, h),
      }),
    ],
  )
}
