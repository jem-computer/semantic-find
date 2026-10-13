// Per-session pasted documents. The sample docs are shared by every visitor;
// pasted docs are visible only to the session that pasted them. Buckets are
// keyed by a session cookie and swept when idle, which also bounds memory.

import { Clock, Context, Effect, Layer, Option } from "effect";
import type { Doc } from "./Document";

const MAX_SESSIONS = 200;
const MAX_PER_SESSION = 20;
const IDLE_MS = 2 * 60 * 60 * 1000;

interface Bucket {
  readonly docs: Map<string, Doc>;
  lastTouch: number;
}

export class PasteStore extends Context.Service<
  PasteStore,
  {
    readonly add: (sid: string, doc: Doc) => Effect.Effect<void>;
    readonly get: (sid: string, id: string) => Effect.Effect<Option.Option<Doc>>;
    readonly list: (sid: string) => Effect.Effect<ReadonlyArray<Doc>>;
  }
>()("semantic-find/PasteStore") {
  static readonly layer = Layer.sync(PasteStore, () => {
    const buckets = new Map<string, Bucket>();

    const sweep = (now: number) => {
      for (const [sid, b] of buckets) {
        if (now - b.lastTouch > IDLE_MS) buckets.delete(sid);
      }
      // Cap as a backstop: evict oldest-touched first.
      if (buckets.size > MAX_SESSIONS) {
        const oldest = [...buckets.entries()].sort((a, b) => a[1].lastTouch - b[1].lastTouch);
        for (const [sid] of oldest.slice(0, buckets.size - MAX_SESSIONS)) buckets.delete(sid);
      }
    };

    const bucket = (sid: string) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        sweep(now);
        let b = buckets.get(sid);
        if (!b) {
          b = { docs: new Map(), lastTouch: now };
          buckets.set(sid, b);
        }
        b.lastTouch = now;
        return b;
      });

    return PasteStore.of({
      add: (sid, doc) =>
        Effect.map(bucket(sid), (b) => {
          b.docs.set(doc.id, doc);
          // Oldest paste out first (Map preserves insertion order).
          for (const id of b.docs.keys()) {
            if (b.docs.size <= MAX_PER_SESSION) break;
            b.docs.delete(id);
          }
        }),
      get: (sid, id) => Effect.map(bucket(sid), (b) => Option.fromNullishOr(b.docs.get(id))),
      list: (sid) => Effect.map(bucket(sid), (b) => [...b.docs.values()]),
    });
  });
}
