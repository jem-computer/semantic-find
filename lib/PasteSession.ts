// One Durable Object per browser session, holding that visitor's pastes.
// Every Worker isolate reaches the same object by session id, so a paste
// made on one request is visible to the next. Each touch pushes back an
// alarm that wipes the session after two idle hours.

import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer, Option } from "effect";
import { toPastedDoc, type Doc, type PasteDraft } from "./Document";
import { IDLE_MS, MAX_PER_SESSION, PasteStore } from "./PasteStore";

// Storage keys: a running paste count, and the docs in paste order.
const COUNT = "count";
const DOCS = "docs";

export default class PasteSession extends Cloudflare.DurableObject<PasteSession>()(
  "PasteSession",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      const storage = state.storage;
      // Storage calls need this instance's runtime context. Every method below
      // runs inside the instance, so provide it here rather than leak the
      // requirement into callers' types through the stub.
      const runtime = yield* RuntimeContext;
      const inInstance = Effect.provideService(RuntimeContext, runtime);

      const touch = Effect.flatMap(Effect.sync(Date.now), (now) => storage.setAlarm(now + IDLE_MS));
      const docs = Effect.map(storage.get<ReadonlyArray<Doc>>(DOCS), (d) => d ?? []);

      return {
        add: (draft: PasteDraft) =>
          Effect.gen(function* () {
            yield* touch;
            const n = ((yield* storage.get<number>(COUNT)) ?? 0) + 1;
            const doc = toPastedDoc(n, draft);
            // Oldest paste out first.
            yield* storage.put(DOCS, [...(yield* docs), doc].slice(-MAX_PER_SESSION));
            yield* storage.put(COUNT, n);
            return doc;
          }).pipe(inInstance),
        get: (id: string) =>
          Effect.gen(function* () {
            yield* touch;
            return (yield* docs).find((d) => d.id === id) ?? null;
          }).pipe(inInstance),
        list: () =>
          Effect.gen(function* () {
            yield* touch;
            return yield* docs;
          }).pipe(inInstance),
        alarm: () => storage.deleteAll(),
      };
    });
  }),
) {}

// The PasteStore contract over PasteSession objects, addressed by session id.
export const layer = Layer.effect(
  PasteStore,
  Effect.gen(function* () {
    const sessions = yield* PasteSession;
    return PasteStore.of({
      add: (sid, draft) => sessions.getByName(sid).add(draft),
      get: (sid, id) => Effect.map(sessions.getByName(sid).get(id), Option.fromNullishOr),
      list: (sid) => sessions.getByName(sid).list(),
    });
  }),
);
