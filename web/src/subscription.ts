import { Number, Option, Schema, Stream, pipe } from 'effect'
import { Subscription } from 'foldkit'

import { MINIMAP_ID } from './ids'
import { Message } from './message'
import { MinimapDrag, type Model } from './model'

const minimapFraction = (clientY: number): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(document.getElementById(MINIMAP_ID)),
    Option.map(element => element.getBoundingClientRect()),
    Option.filter(({ height }) => height > 0),
    Option.map(({ top, height }) =>
      Number.clamp((clientY - top) / height, { minimum: 0, maximum: 1 }),
    ),
  )

const minimapDragStreams: ReadonlyArray<Stream.Stream<Message>> = [
  Subscription.fromEventFilterMap({
    target: () => document,
    type: 'pointermove',
    filterMapEvent: ({ clientY }) =>
      Option.map(minimapFraction(clientY), fraction =>
        Message.MovedMinimapPointer({ fraction }),
      ),
  }),
  Subscription.fromEvent({
    target: () => document,
    type: 'pointerup',
    mapEvent: () => Message.ReleasedMinimap(),
  }),
  Subscription.fromEvent({
    target: () => document,
    type: 'pointercancel',
    mapEvent: () => Message.ReleasedMinimap(),
  }),
]

const minimapDragEvents = Stream.mergeAll(minimapDragStreams, {
  concurrency: 'unbounded',
})

export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  minimapDrag: entry(
    { isDragging: Schema.Boolean },
    {
      modelToDependencies: model => ({
        isDragging: MinimapDrag.guards.Dragging(model.minimapDrag),
      }),
      dependenciesToStream: ({ isDragging }) =>
        isDragging ? minimapDragEvents : Stream.empty,
    },
  ),
}))
