import { clsx } from 'clsx'
import { Array, Match, Option, String } from 'effect'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import { Doc, LineMarkup } from '../domain'
import { highlightLine } from '../highlight'
import type { Message } from '../message'
import { externalLinkView } from './externalLink'

const ZERO_WIDTH_SPACE = globalThis.String.fromCodePoint(0x200b)

type LineContent = Readonly<{
  className: string
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
      Italic: ({ text }) => h.em([], [text]),
      Code: ({ text }) => h.code([], [text]),
      Link: ({ text, href }) => externalLinkView(href, text, h),
    }),
  )

const codeContent = (
  text: string,
  maybeLanguage: Option.Option<string>,
  h: HtmlBuilder<Message>,
): LineContent => {
  if (String.isEmpty(text)) {
    return { className: '', children: [ZERO_WIDTH_SPACE] }
  } else {
    return Option.match(maybeLanguage, {
      onNone: () => ({ className: '', children: [text] }),
      onSome: language => ({
        className: '',
        children: [h.span([h.InnerHTML(highlightLine(text, language))])],
      }),
    })
  }
}

const logContent = (text: string, h: HtmlBuilder<Message>): LineContent =>
  Option.match(LineMarkup.parseLogLine(text), {
    onNone: () => ({ className: '', children: [text] }),
    onSome: ({ timestamp, level, rest }) => ({
      className: '',
      children: [
        `${timestamp} `,
        h.span([h.Class(`lv lv-${level}`)], [level]),
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
        className: 'line-h1',
        children: inlineView(line.replace(MARKDOWN_H1, ''), h),
      }),
    ),
    Match.when(
      line => MARKDOWN_H2.test(line),
      line => ({
        className: 'line-h2',
        children: inlineView(line.replace(MARKDOWN_H2, ''), h),
      }),
    ),
    Match.orElse(line => proseContent(line, h)),
  )

const proseContent = (text: string, h: HtmlBuilder<Message>): LineContent => ({
  className: LineMarkup.isProseHeading(text) ? 'line-h2' : '',
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
  const { className, children } = lineContent(text, kind, maybeCodeLanguage, h)
  const id = Doc.lineId(lineIndex)

  return h.keyed('p')(
    id,
    [
      h.Id(id),
      h.Class(clsx('doc-line', className, { hot: isHot, flash: isFlashed })),
      h.Style({
        '--heat': heat.toFixed(3),
        '--edge': isHot ? '1' : '0',
      }),
    ],
    [h.span([h.Class('pct')], [badge]), ...children],
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
