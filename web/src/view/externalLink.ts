import type { Html, HtmlBuilder } from 'foldkit/html'

import { css } from '@pleat/foldkit'

import type { Message } from '../message'
import { link } from '../style/theme'

export const externalLinkView = (
  href: string,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.a(
    [
      h.Href(href),
      h.Target('_blank'),
      h.Rel('noopener noreferrer'),
      ...css(link),
    ],
    [label],
  )
