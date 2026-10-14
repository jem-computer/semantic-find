import { Global, Recipe, Style, Theme, Var, When } from '@pleat/core'

import { NARROW, focusRing, pinkSurface, tokens } from './theme'

// SIDEBAR

export const sidebar = Style.make({
  width: '21rem',
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  padding: '1.5rem 1.25rem 1.1rem',
  borderRight: `1px solid ${tokens.color.line}`,
  background: tokens.color.softPink,
  overflowY: 'auto',
}).pipe(
  Style.when(NARROW, {
    width: '100%',
    borderRight: 0,
    borderBottom: `1px solid ${tokens.color.line}`,
  }),
)

// NOTE: the controls share one column that never shrinks, so long results
// scroll the sidebar instead of crushing the controls above them.
export const controls = Style.make({
  display: 'flex',
  flex: 'none',
  flexDirection: 'column',
  gap: '.35rem',
})

export const pinkSurfaceBindings = Theme.bindings(pinkSurface)

// BRAND

export const brand = Style.make({
  display: 'flex',
  alignItems: 'center',
  gap: '.65rem',
  marginBottom: '1.4rem',
})

export const logo = Style.make({ height: 24, display: 'block' })

export const appName = Style.make({
  paddingLeft: '.65rem',
  borderLeft: `1px solid ${tokens.color.line}`,
  font: `700 .8rem/1 ${tokens.font.mono}`,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: tokens.color.muted,
})

// DOCUMENT PICKER

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%231E1E1E' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")"

export const docSelect = Style.make({
  width: '100%',
  appearance: 'none',
  padding: '.6rem 2rem .6rem .75rem',
  border: `1px solid ${tokens.color.black}`,
  borderRadius: 2,
  font: `500 .88rem/1.4 ${tokens.font.sans}`,
  letterSpacing: '-0.01em',
  color: tokens.color.ink,
  background: `${tokens.color.white} ${CHEVRON} no-repeat right .8rem center`,
  cursor: 'pointer',
}).pipe(Style.merge(focusRing))

export const pasteOpen = Style.make({
  marginTop: '.45rem',
  alignSelf: 'flex-start',
  padding: '.2rem 0',
  border: 0,
  font: `400 .68rem/1 ${tokens.font.mono}`,
  letterSpacing: '.06em',
  color: tokens.color.black,
  background: 'transparent',
  cursor: 'pointer',
}).pipe(Style.when(When.hover, { textDecoration: 'underline' }))

// SEARCH

export const searchForm = Style.make({ margin: 0 })

export const searchBox = Style.make({
  display: 'flex',
  border: `1px solid ${tokens.color.black}`,
  borderRadius: 2,
  background: tokens.color.white,
  overflow: 'hidden',
}).pipe(
  Style.when(When.focusWithin, {
    outline: `2px solid ${tokens.color.black}`,
    outlineOffset: 1,
  }),
)

export const queryInput = Style.make({
  flex: 1,
  minWidth: 0,
  padding: '.65rem .75rem',
  border: 0,
  font: `400 .9rem/1.4 ${tokens.font.sans}`,
  color: tokens.color.ink,
  background: 'transparent',
}).pipe(
  Style.when(When.pseudoElement('::placeholder'), {
    color: tokens.color.muted,
    opacity: 0.75,
  }),
  Style.when(When.focus, { outline: 'none' }),
)

const pulse = Global.keyframes('pulse', { '50%': { opacity: 0.45 } })

export const searchButton = Recipe.make({
  base: Style.make({
    padding: '0 .9rem',
    border: 0,
    font: `700 1rem/1 ${tokens.font.mono}`,
    color: tokens.color.white,
    background: tokens.color.black,
    cursor: 'pointer',
    transition: 'background .15s',
  }).pipe(
    Style.when(When.hover, {
      background: tokens.color.neonPink,
      color: tokens.color.black,
    }),
    Style.when(When.disabled, { color: tokens.color.muted, cursor: 'wait' }),
  ),
  variants: {
    isSearching: {
      true: { animation: `${pulse} 1s ease-in-out infinite` },
      false: {},
    },
  },
})

export const suggestions = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '.4rem',
  marginTop: '.7rem',
})

export const suggestion = Style.make({
  padding: '.28rem .6rem',
  border: `1px solid ${tokens.color.line}`,
  borderRadius: 999,
  font: `400 .68rem/1.35 ${tokens.font.mono}`,
  letterSpacing: '-0.02em',
  textAlign: 'left',
  color: tokens.color.ink,
  background: 'transparent',
  cursor: 'pointer',
  transition: 'color .15s, border-color .15s',
}).pipe(
  Style.when(When.hover, {
    color: tokens.color.black,
    borderColor: tokens.color.black,
    background: tokens.color.white,
  }),
)

// RESULTS

export const verdict = Style.make({ marginTop: '1.1rem' })

export const verdictChip = Recipe.make({
  base: Style.make({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.45rem',
    padding: '.45rem .6rem',
    borderRadius: 2,
    font: `700 .7rem/1 ${tokens.font.mono}`,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  }).pipe(
    Style.when(When.pseudoElement('::before'), {
      content: '""',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'currentColor',
    }),
  ),
  variants: {
    verdict: {
      Answered: { background: tokens.color.black, color: tokens.color.white },
      Partial: {
        background: tokens.color.white,
        color: tokens.color.black,
        boxShadow: `inset 0 0 0 1px ${tokens.color.black}`,
      },
      Absent: { background: tokens.color.demurGray, color: tokens.color.black },
    },
  },
})

export const matchList = Style.make({
  display: 'grid',
  gap: '.45rem',
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

export const matchItem = Style.make({ margin: 0 })

export const matchButton = Style.make({
  display: 'grid',
  gap: '.3rem',
  width: '100%',
  padding: '.5rem .6rem',
  border: '1px solid transparent',
  borderRadius: 2,
  textAlign: 'left',
  background: tokens.color.white,
  cursor: 'pointer',
  transition: 'border-color .15s, transform .1s',
}).pipe(Style.when(When.hover, { borderColor: tokens.color.black }))

export const matchHead = Style.make({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
})

export const matchLine = Style.make({
  font: `700 .65rem/1 ${tokens.font.mono}`,
  color: tokens.color.black,
})

export const matchScore = Style.make({
  font: `400 .65rem/1 ${tokens.font.mono}`,
  color: tokens.color.muted,
})

export const matchBar = Style.make({
  display: 'block',
  height: 3,
  background: tokens.color.hairline,
  overflow: 'hidden',
})

export const barPercent = Var.number('bar-percent', { fallback: '0' })

export const matchBarFill = Style.make({
  display: 'block',
  width: `calc(${barPercent} * 1%)`,
  height: '100%',
  background: tokens.color.neonPink,
})

export const matchText = Style.make({
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  font: `500 .76rem/1.4 ${tokens.font.sans}`,
  color: tokens.color.ink,
})

// FOOTER

export const footer = Style.make({
  display: 'grid',
  flex: 'none',
  gap: '.35rem',
  marginTop: 'auto',
  paddingTop: '1.4rem',
  font: `400 .62rem/1.6 ${tokens.font.mono}`,
  letterSpacing: '-0.02em',
  color: tokens.color.muted,
})
