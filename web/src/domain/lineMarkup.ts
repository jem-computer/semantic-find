import { Array, Option, Schema, String, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const InlineToken = defineTaggedUnion({
  Plain: { text: Schema.String },
  Bold: { text: Schema.String },
  Italic: { text: Schema.String },
  Code: { text: Schema.String },
  Link: { text: Schema.String, href: Schema.String },
})
export type InlineToken = typeof InlineToken.Type

const INLINE_PATTERN =
  /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)/g

const toToken = (match: RegExpMatchArray): InlineToken => {
  const [, bold, italic, code, linkText, href] = match

  if (bold !== undefined) {
    return InlineToken.Bold({ text: bold })
  } else if (italic !== undefined) {
    return InlineToken.Italic({ text: italic })
  } else if (code !== undefined) {
    return InlineToken.Code({ text: code })
  } else {
    return InlineToken.Link({ text: linkText ?? '', href: href ?? '' })
  }
}

type Scan = Readonly<{ tokens: ReadonlyArray<InlineToken>; cursor: number }>

const plainBetween = (
  text: string,
  start: number,
  end: number,
): ReadonlyArray<InlineToken> =>
  end > start ? [InlineToken.Plain({ text: text.slice(start, end) })] : []

export const tokenizeInline = (text: string): ReadonlyArray<InlineToken> => {
  const scan = pipe(
    Array.fromIterable(text.matchAll(INLINE_PATTERN)),
    Array.reduce<Scan, RegExpMatchArray>(
      { tokens: [], cursor: 0 },
      ({ tokens, cursor }, match) => {
        const start = match.index ?? cursor
        return {
          tokens: [
            ...tokens,
            ...plainBetween(text, cursor, start),
            toToken(match),
          ],
          cursor: start + match[0].length,
        }
      },
    ),
  )

  return [...scan.tokens, ...plainBetween(text, scan.cursor, text.length)]
}

const LOG_LEVEL_PATTERN = /^(\S+) (ERROR|WARN|INFO)(\s.*)$/s

const LogLevel = Schema.Literals(['ERROR', 'WARN', 'INFO'])
type LogLevel = typeof LogLevel.Type

type LogLine = Readonly<{
  timestamp: string
  level: LogLevel
  rest: string
}>

export const parseLogLine = (text: string): Option.Option<LogLine> =>
  pipe(
    String.match(LOG_LEVEL_PATTERN)(text),
    Option.flatMap(([, timestamp, level, rest]) =>
      pipe(
        Schema.decodeUnknownOption(LogLevel)(level),
        Option.map(decodedLevel => ({
          timestamp: timestamp ?? '',
          level: decodedLevel,
          rest: rest ?? '',
        })),
      ),
    ),
  )

const PROSE_HEADING_MAX_LENGTH = 65

export const isProseHeading = (text: string): boolean =>
  text.length < PROSE_HEADING_MAX_LENGTH &&
  /^[A-Z0-9]/.test(text) &&
  !/[.!?:,;…]$/.test(text) &&
  !/\d{2}:\d{2}/.test(text)
