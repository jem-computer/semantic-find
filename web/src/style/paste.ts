import { Style, Theme, When } from '@pleat/core'

import { fieldLabel, focusRing, nearBlack, pinkSurface, tokens } from './theme'

export const dialog = Style.make({}).pipe(
  Style.when(When.open, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  Style.when(When.pseudoElement('::backdrop'), { background: 'transparent' }),
)

export const backdrop = Style.make({
  position: 'fixed',
  inset: 0,
  background: nearBlack(0.35),
})

export const panel = Style.make({
  position: 'relative',
  width: 'min(44rem, 92vw)',
  padding: '1.4rem',
  border: `1px solid ${tokens.color.black}`,
  borderRadius: 2,
  color: tokens.color.ink,
  background: tokens.color.softPink,
})

export const pinkSurfaceBindings = Theme.bindings(pinkSurface)

export const form = Style.make({ display: 'grid', gap: '.7rem' })

export const title = fieldLabel.pipe(Style.merge(Style.make({ margin: 0 })))

export const field = Style.make({
  width: '100%',
  padding: '.6rem .75rem',
  border: `1px solid ${tokens.color.black}`,
  borderRadius: 2,
  font: `500 .9rem/1.5 ${tokens.font.sans}`,
  color: tokens.color.ink,
  background: tokens.color.white,
}).pipe(Style.merge(focusRing))

export const text = field.pipe(
  Style.merge(
    Style.make({
      resize: 'vertical',
      font: `400 .8rem/1.5 ${tokens.font.mono}`,
    }),
  ),
)

export const kindToggle = Style.make({ marginTop: 0 })

export const actions = Style.make({
  display: 'flex',
  alignItems: 'center',
  gap: '.7rem',
})

export const hint = Style.make({
  marginRight: 'auto',
  font: `400 .65rem/1.4 ${tokens.font.mono}`,
  color: tokens.color.muted,
})

export const cancel = Style.make({
  padding: '.55rem .4rem',
  border: 0,
  font: `400 .75rem/1 ${tokens.font.mono}`,
  color: tokens.color.muted,
  background: 'transparent',
  cursor: 'pointer',
})

export const submit = Style.make({
  padding: '.6rem .9rem',
  border: 0,
  borderRadius: 2,
  font: `700 .75rem/1 ${tokens.font.mono}`,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: tokens.color.white,
  background: tokens.color.black,
  cursor: 'pointer',
}).pipe(
  Style.when(When.hover, {
    background: tokens.color.neonPink,
    color: tokens.color.black,
  }),
  Style.when(When.disabled, { opacity: 0.5, cursor: 'wait' }),
)
