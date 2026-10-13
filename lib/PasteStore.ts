// Per-session pasted documents. The sample docs are shared by every visitor;
// pasted docs are visible only to the session that pasted them, and expire
// after two idle hours.
//
// Deployed, the store is a Durable Object per session (lib/PasteSession.ts),
// since Worker isolates share no memory. `layerMemory` is the same contract
// held in one process, for tests.

import { Clock, Context, Effect, Layer, Option } from "effect";
import { toPastedDoc, type Doc, type PasteDraft } from "./Document";

export const MAX_PER_SESSION = 20;
export const IDLE_MS = 2 * 60 * 60 * 1000;

export class PasteStore extends Context.Service<
  PasteStore,
  {
    readonly add: (sid: string, draft: PasteDraft) => Effect.Effect<Doc>;
    readonly get: (sid: string, id: string) => Effect.Effect<Option.Option<Doc>>;
    readonly list: (sid: string) => Effect.Effect<ReadonlyArray<Doc>>;
  }
>()("semantic-find/PasteStore") {
  static readonly layerMemory = Layer.sync(PasteStore, () => {
    interface Bucket {
      readonly docs: Map<string, Doc>;
      count: number;
      lastTouch: number;
    }
    const buckets = new Map<string, Bucket>();

    const bucket = (sid: string) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        for (const [id, b] of buckets) {
          if (now - b.lastTouch > IDLE_MS) buckets.delete(id);
        }
        let b = buckets.get(sid);
        if (!b) {
          b = { docs: new Map(), count: 0, lastTouch: now };
          buckets.set(sid, b);
        }
        b.lastTouch = now;
        return b;
      });

    return PasteStore.of({
      add: (sid, draft) =>
        Effect.map(bucket(sid), (b) => {
          const doc = toPastedDoc(++b.count, draft);
          b.docs.set(doc.id, doc);
          // Oldest paste out first (Map preserves insertion order).
          for (const id of b.docs.keys()) {
            if (b.docs.size <= MAX_PER_SESSION) break;
            b.docs.delete(id);
          }
          return doc;
        }),
      get: (sid, id) => Effect.map(bucket(sid), (b) => Option.fromNullishOr(b.docs.get(id))),
      list: (sid) => Effect.map(bucket(sid), (b) => [...b.docs.values()]),
    });
  });
}
