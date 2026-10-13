// The API Worker. Init (the outer Effect) runs at deploy time and at isolate
// boot: it declares the PasteSession Durable Object and the Workers AI
// binding, and builds the router once. `fetch` then handles each request with
// that router, providing the Clef decision model per request because the AI
// binding only works while a request is in flight. It has no public URL: the
// site Worker (web/worker/worker.ts) reaches it through a service binding.

import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import * as ClefDecisionModel from "./ClefDecisionModel";
import { Documents } from "./Documents";
import * as PasteSession from "./PasteSession";
import { Routes } from "./Routes";
import { Search } from "./Search";

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.url, workersDev: false },
  Effect.gen(function* () {
    const ai = yield* Cloudflare.Workers.AI();
    const handler = yield* HttpRouter.toHttpEffect(
      Routes.pipe(Layer.provide(Search.layer), Layer.provide(Documents.layer), Layer.provide(PasteSession.layer)),
    );
    return {
      fetch: handler.pipe(Effect.provide(ClefDecisionModel.layer(ai))),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.AIBinding)),
);
