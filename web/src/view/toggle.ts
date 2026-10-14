import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RadioGroup } from '@foldkit/ui'
import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import type { Message } from '../message'
import { tokens } from '../style/theme'

const toggleButton = When.marker('toggle-button')

const group = Style.make({
  display: 'flex',
  marginTop: '.7rem',
  border: `1px solid ${tokens.color.black}`,
  borderRadius: 2,
  overflow: 'hidden',
})

const option = Style.make({
  flex: 1,
  padding: '.5rem .4rem',
  border: 0,
  font: `400 .7rem/1 ${tokens.font.mono}`,
  letterSpacing: '.04em',
  textAlign: 'center',
  color: tokens.color.ink,
  background: tokens.color.white,
  cursor: 'pointer',
  transition: 'background .15s, color .15s',
}).pipe(
  Style.merge(Style.mark(toggleButton)),
  Style.when(When.precededBy(toggleButton), {
    borderLeft: `1px solid ${tokens.color.black}`,
  }),
  Style.when(When.checked, {
    background: tokens.color.neonPink,
    color: tokens.color.black,
    fontWeight: 700,
  }),
  Style.when(When.focusVisible, {
    outline: `2px solid ${tokens.color.black}`,
    outlineOffset: -3,
  }),
)

type ToggleCopy<Value extends string> = Readonly<{
  labels: Record<Value, string>
  titles: Record<Value, string>
  groupStyle: Style.Style
}>

export const segmentedToggleView =
  <Value extends string>(
    { labels, titles, groupStyle }: ToggleCopy<Value>,
    h: HtmlBuilder<Message>,
  ) =>
  ({ group: groupAttributes, options }: RadioGroup.RenderInfo<Value>): Html =>
    h.div(
      [...groupAttributes, ...css(group, groupStyle)],
      Array.map(options, renderedOption =>
        h.div(
          [
            ...renderedOption.option,
            ...css(option),
            h.Title(titles[renderedOption.value]),
          ],
          [h.span([...renderedOption.label], [labels[renderedOption.value]])],
        ),
      ),
    )
