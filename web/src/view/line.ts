import { Array, Match, Option, String } from 'effect'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import { Var } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Doc, LineMarkup } from '../domain'
import { highlightLine } from '../highlight'
import type { Message } from '../message'
import * as DocumentStyle from '../style/document'
import { externalLinkView } from './externalLink'

const HEAT_DIGITS = 3

export const LINE_DATA_ATTRIBUTE = 'line'

const ZERO_WIDTH_SPACE = globalThis.String.fromCodePoint(0x200b)

type Heading = 'None' | 'H1' | 'H2'

type LineContent = Readonly<{
  heading: Heading
  children: ReadonlyArray<Html | string>
}>

const inlineView = (
  text: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html | string> =>
  Array.map(LineMarkup.tokenizeInline(text), token =>
    LineMarkup.InlineToken.match<Html | string>(token, {
      Plain: ({ text }) => text,
      Bold: ({ text }) => h.b([], [text]),
      Italic: ({ text }) => h.em([...css(DocumentStyle.emphasis)], [text]),
      Code: ({ text }) => h.code([...css(DocumentStyle.inlineCode)], [text]),
      Link: ({ text, href }) => externalLinkView(href, text, h),
    }),
  )

const codeContent = (
  text: string,
  maybeLanguage: Option.Option<string>,
  h: HtmlBuilder<Message>,
): LineContent => {
  if (String.isEmpty(text)) {
    return { heading: 'None', children: [ZERO_WIDTH_SPACE] }
  } else {
    return Option.match(maybeLanguage, {
      onNone: () => ({ heading: 'None', children: [text] }),
      onSome: language => ({
        heading: 'None',
        children: [h.span([h.InnerHTML(highlightLine(text, language))])],
      }),
    })
  }
}

const logContent = (text: string, h: HtmlBuilder<Message>): LineContent =>
  Option.match(LineMarkup.parseLogLine(text), {
    onNone: () => ({ heading: 'None', children: [text] }),
    onSome: ({ timestamp, level, rest }) => ({
      heading: 'None',
      children: [
        `${timestamp} `,
        h.span([...css(DocumentStyle.logLevel({ level }))], [level]),
        rest,
      ],
    }),
  })

const MARKDOWN_H1 = /^# /
const MARKDOWN_H2 = /^#{2,3} /

const markdownContent = (text: string, h: HtmlBuilder<Message>): LineContent =>
  Match.value(text).pipe(
    Match.withReturnType<LineContent>(),
    Match.when(
      line => MARKDOWN_H1.test(line),
      line => ({
        heading: 'H1',
        children: inlineView(line.replace(MARKDOWN_H1, ''), h),
      }),
    ),
    Match.when(
      line => MARKDOWN_H2.test(line),
      line => ({
        heading: 'H2',
        children: inlineView(line.replace(MARKDOWN_H2, ''), h),
      }),
    ),
    Match.orElse(line => proseContent(line, h)),
  )

const proseContent = (text: string, h: HtmlBuilder<Message>): LineContent => ({
  heading: LineMarkup.isProseHeading(text) ? 'H2' : 'None',
  children: inlineView(text, h),
})

const lineContent = (
  text: string,
  kind: Doc.DocKind,
  maybeCodeLanguage: Option.Option<string>,
  h: HtmlBuilder<Message>,
): LineContent =>
  Match.value(kind).pipe(
    Match.withReturnType<LineContent>(),
    Match.when('Code', () => codeContent(text, maybeCodeLanguage, h)),
    Match.when('Log', () => logContent(text, h)),
    Match.when('Markdown', () => markdownContent(text, h)),
    Match.when('Prose', () => proseContent(text, h)),
    Match.exhaustive,
  )

const lineView = (
  lineIndex: number,
  text: string,
  kind: Doc.DocKind,
  maybeCodeLanguage: Option.Option<string>,
  heat: number,
  isHot: boolean,
  badge: string,
  isFlashed: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  const { heading, children } = lineContent(text, kind, maybeCodeLanguage, h)
  const id = Doc.lineId(lineIndex)

  return h.keyed('p')(
    id,
    [
      h.Id(id),
      h.DataAttribute(LINE_DATA_ATTRIBUTE, ''),
      ...css(
        DocumentStyle.line({ kind, heading, isFlashed }),
        Var.bind(DocumentStyle.heat, Number(heat.toFixed(HEAT_DIGITS))),
        Var.bind(DocumentStyle.edge, isHot ? 1 : 0),
      ),
    ],
    [
      h.span([...css(DocumentStyle.badge({ isVisible: isHot }))], [badge]),
      ...children,
    ],
  )
}

// NOTE: createKeyedLazy compares arguments by reference, so the line inputs
// are passed as separate primitives rather than one freshly built record.
const lazyLine = createKeyedLazy()

type LineInputs = Readonly<{
  lineIndex: number
  text: string
  kind: Doc.DocKind
  maybeCodeLanguage: Option.Option<string>
  heat: number
  isHot: boolean
  badge: string
  isFlashed: boolean
}>

export const memoLineView = (
  {
    lineIndex,
    text,
    kind,
    maybeCodeLanguage,
    heat,
    isHot,
    badge,
    isFlashed,
  }: LineInputs,
  h: HtmlBuilder<Message>,
): Html =>
  lazyLine(lineIndex, lineView, [
    lineIndex,
    text,
    kind,
    maybeCodeLanguage,
    heat,
    isHot,
    badge,
    isFlashed,
    h,
  ])
