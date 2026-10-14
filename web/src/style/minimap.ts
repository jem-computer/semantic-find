import { Style, Var } from '@pleat/core'

import { NARROW, nearBlack, tokens } from './theme'

export const minimap = Style.make({
  position: 'relative',
  flex: 'none',
  width: 84,
  borderLeft: `1px solid ${tokens.color.hairline}`,
  background: tokens.color.white,
  cursor: 'pointer',
  userSelect: 'none',
}).pipe(Style.when(NARROW, { width: 44 }))

export const canvas = Style.make({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
})

export const viewportTop = Var.number('viewport-top', { fallback: '0' })
export const viewportHeight = Var.number('viewport-height', { fallback: '0' })

export const viewport = Style.make({
  position: 'absolute',
  left: 0,
  right: 0,
  top: `calc(${viewportTop} * 100%)`,
  height: `calc(${viewportHeight} * 100%)`,
  border: `1px solid ${nearBlack(0.3)}`,
  borderLeft: 0,
  borderRight: 0,
  background: nearBlack(0.06),
  pointerEvents: 'none',
})
