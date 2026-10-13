import type { Html, HtmlBuilder } from 'foldkit/html'

import type { Message } from '../message'

export const externalLinkView = (
  href: string,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.a([h.Href(href), h.Target('_blank'), h.Rel('noopener noreferrer')], [label])
