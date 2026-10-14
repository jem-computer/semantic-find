import { Recipe, Style, Var, When } from '@pleat/core'

import { NARROW, link, nearBlack, neonPink, tokens } from './theme'

// LAYOUT

export const app = Style.make({ display: 'flex', height: '100%' }).pipe(
  Style.when(NARROW, { flexDirection: 'column' }),
)

export const docPane = Style.make({
  position: 'relative',
  display: 'flex',
  flex: 1,
  minWidth: 0,
  background: tokens.color.white,
}).pipe(Style.when(NARROW, { minHeight: 0 }))

export const docScroll = Style.make({
  flex: 1,
  overflowY: 'auto',
  scrollBehavior: 'smooth',
  scrollbarWidth: 'thin',
})

const dimmedDoc = When.marker('dimmed-doc')

export const doc = Recipe.make({
  base: { maxWidth: '46rem', margin: '0 auto', padding: '3rem 2.5rem 40vh' },
  variants: {
    isDimmed: { true: Style.mark(dimmedDoc), false: {} },
  },
})

export const docTitle = Style.make({
  margin: '0 0 1.8rem',
  paddingBottom: '1rem',
  borderBottom: `1px solid ${tokens.color.hairline}`,
  font: `500 2.4rem/0.95 ${tokens.font.sans}`,
  letterSpacing: '-0.035em',
  color: tokens.color.black,
})

export const docStatus = Style.make({
  font: `400 .8rem/1.5 ${tokens.font.mono}`,
  color: tokens.color.muted,
})

// LINES

export const heat = Var.number('heat', { fallback: '0' })
export const edge = Var.number('edge', { fallback: '0' })

const HEAT_ALPHA = 0.5
const DIMMED_HEAT_ALPHA = 0.12

const monoLine = (fontSize: string, paddingBlock: string) =>
  Style.make({
    marginBottom: 0,
    paddingTop: paddingBlock,
    paddingBottom: paddingBlock,
    font: `400 ${fontSize}/1.55 ${tokens.font.mono}`,
    letterSpacing: '-0.02em',
    whiteSpace: 'pre-wrap',
  })

export const line = Recipe.make({
  base: Style.make({
    margin: '0 0 .35rem',
    padding: '.3rem .65rem',
    borderRadius: 2,
    font: `500 .95rem/1.55 ${tokens.font.sans}`,
    background: neonPink(`calc(${heat} * ${HEAT_ALPHA})`),
    boxShadow: `inset 3px 0 0 ${nearBlack(edge.toString())}`,
    transition: 'background .5s ease, box-shadow .5s ease',
  }).pipe(
    Style.when(When.within(dimmedDoc), {
      background: neonPink(`calc(${heat} * ${DIMMED_HEAT_ALPHA})`),
    }),
  ),
  variants: {
    kind: {
      Prose: {},
      Markdown: {},
      Log: monoLine('.74rem', '.12rem'),
      Code: monoLine('.78rem', '.1rem').pipe(
        Style.merge(
          Style.make({
            lineHeight: 1.5,
            letterSpacing: '-0.01em',
            tabSize: 4,
            minHeight: '1.2em',
          }),
        ),
      ),
    },
    heading: {
      None: {},
      H1: {
        marginTop: '1.6rem',
        font: `500 1.4rem/1.1 ${tokens.font.sans}`,
        letterSpacing: '-0.03em',
      },
      H2: {
        marginTop: '1.1rem',
        font: `500 1.1rem/1.25 ${tokens.font.sans}`,
        letterSpacing: '-0.02em',
        color: tokens.color.black,
      },
    },
    isFlashed: {
      true: { outline: `2px solid ${tokens.color.black}`, outlineOffset: 1 },
      false: {},
    },
  },
})

export const badge = Recipe.make({
  base: {
    float: 'right',
    marginLeft: '.8rem',
    font: `700 .62rem/1.8 ${tokens.font.mono}`,
    color: tokens.color.black,
    opacity: 0,
    transition: 'opacity .5s',
  },
  variants: { isVisible: { true: { opacity: 1 }, false: {} } },
})

// INLINE MARKUP

export const emphasis = Style.make({ color: tokens.color.muted })

export const inlineCode = Style.make({
  padding: '.05em .3em',
  borderRadius: 3,
  font: `400 .85em ${tokens.font.mono}`,
  background: tokens.color.hairline,
})

export const inlineLink = link

export const logLevel = Recipe.make({
  base: { fontWeight: 700 },
  variants: {
    level: {
      ERROR: {
        padding: '0 .2em',
        color: tokens.color.black,
        background: tokens.color.softPink,
      },
      WARN: { color: tokens.color.black },
      INFO: { color: tokens.color.muted, fontWeight: 400 },
    },
  },
})
