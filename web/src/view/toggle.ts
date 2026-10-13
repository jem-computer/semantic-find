import { clsx } from 'clsx'
import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { RadioGroup } from '@foldkit/ui'

import type { Message } from '../message'

type ToggleCopy<Value extends string> = Readonly<{
  labels: Record<Value, string>
  titles: Record<Value, string>
  className: string
}>

export const segmentedToggleView =
  <Value extends string>(
    { labels, titles, className }: ToggleCopy<Value>,
    h: HtmlBuilder<Message>,
  ) =>
  ({ group, options }: RadioGroup.RenderInfo<Value>): Html =>
    h.div(
      [...group, h.Class(clsx('mode-toggle', className))],
      Array.map(options, option =>
        h.div(
          [
            ...option.option,
            h.Class(clsx('mode-btn', { active: option.isSelected })),
            h.Title(titles[option.value]),
          ],
          [h.span([...option.label], [labels[option.value]])],
        ),
      ),
    )
