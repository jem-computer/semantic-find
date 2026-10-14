import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'

import { css } from '@pleat/foldkit'

import { Search } from '../domain'
import type { Message } from '../message'
import type { Model } from '../model'
import { app } from '../style/document'
import { documentPaneView } from './document'
import { pasteDialogView } from './pasteDialog'
import { sidebarView } from './sidebar'

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const maybeHeatmap = Option.map(
    AsyncData.getData(model.search),
    Search.toHeatmap,
  )

  return {
    title: 'Semantic Find · TypeSafe AI',
    lang: 'en',
    body: h.div(
      [...css(app)],
      [
        sidebarView(model, maybeHeatmap, h),
        documentPaneView(model, maybeHeatmap, h),
        pasteDialogView(model.pasteForm, h),
      ],
    ),
  }
}
