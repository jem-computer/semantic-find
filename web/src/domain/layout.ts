import { Schema } from 'effect'

const LineBox = Schema.Struct({
  top: Schema.Number,
  height: Schema.Number,
})

export const DocLayout = Schema.Struct({
  scrollHeight: Schema.Number,
  clientHeight: Schema.Number,
  lines: Schema.Array(LineBox),
})
export type DocLayout = typeof DocLayout.Type

type ViewportBox = Readonly<{
  topFraction: number
  heightFraction: number
}>

export const viewportBox = (
  { scrollHeight, clientHeight }: DocLayout,
  scrollTop: number,
): ViewportBox => ({
  topFraction: scrollTop / scrollHeight,
  heightFraction: Math.min(1, clientHeight / scrollHeight),
})

export const scrollTopAtFraction = (
  { scrollHeight, clientHeight }: DocLayout,
  fraction: number,
): number => fraction * scrollHeight - clientHeight / 2
