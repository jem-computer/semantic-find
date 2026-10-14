import { Global, Style, Theme, Token, When } from '@pleat/core'

// TOKENS

export const tokens = Token.make({
  color: {
    softPink: Token.color,
    neonPink: Token.color,
    black: Token.color,
    white: Token.color,
    demurGray: Token.color,
    ink: Token.color,
    muted: Token.color,
    line: Token.color,
    hairline: Token.color,
  },
  heatRgb: Token.value,
  font: { mono: Token.fontFamily, sans: Token.fontFamily },
})

const INK = 'rgb(30 30 30 / 0.86)'

export const brand = Theme.make(tokens, {
  color: {
    softPink: '#F386A1',
    neonPink: '#E551BA',
    black: '#1E1E1E',
    white: '#FEFEFE',
    demurGray: '#ABBAB9',
    ink: INK,
    muted: 'rgb(30 30 30 / 0.66)',
    line: 'rgb(30 30 30 / 0.22)',
    hairline: 'rgb(30 30 30 / 0.08)',
  },
  heatRgb: '229, 81, 186',
  font: {
    mono: '"JetBrains Mono", ui-monospace, monospace',
    sans: '"Die Grotesk C", "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
})

// NOTE: Soft Pink surfaces carry one text color (Faded Black); hierarchy comes
// from size, case, and weight, so muted text and lines darken there.
export const pinkSurface = Theme.extend(brand, tokens, {
  color: { muted: INK, line: 'rgb(30 30 30 / 0.55)' },
})

export const NARROW = When.maxWidth('900px')

// GLOBALS

Global.theme(brand)
Global.rule('*', { boxSizing: 'border-box' })
Global.rule('html, body, #root', { height: '100%' })
Global.rule('body', {
  margin: 0,
  background: tokens.color.white,
  color: tokens.color.ink,
  font: `500 1rem/1.5 ${tokens.font.sans}`,
  letterSpacing: '-0.01em',
})

// SHARED STYLES

export const fieldLabel = Style.make({
  display: 'block',
  margin: '.9rem 0 .45rem',
  font: `400 .68rem/1 ${tokens.font.mono}`,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: tokens.color.muted,
})

export const focusRing = Style.make({}).pipe(
  Style.when(When.focusVisible, {
    outline: `2px solid ${tokens.color.black}`,
    outlineOffset: 1,
  }),
)

export const metaText = Style.make({
  marginTop: '.5rem',
  font: `400 .68rem/1.6 ${tokens.font.mono}`,
  letterSpacing: '-0.02em',
  color: tokens.color.muted,
})

export const metaEmphasis = Style.make({
  color: tokens.color.black,
  fontWeight: 700,
})

export const link = Style.make({ color: tokens.color.black })
