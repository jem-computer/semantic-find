// The API Worker. Init (the outer Effect) runs at deploy time and at isolate
// boot: it declares the PasteSession Durable Object and the TYPESAFE_API_KEY
// secret, and builds the router once. `fetch` then handles each request with
// that router. It has no public URL: the site Worker (web/worker/worker.ts)
// reaches it through a service binding.

import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { Documents } from "./Documents";
import * as PasteSession from "./PasteSession";
import { Routes } from "./Routes";
import { Search } from "./Search";

// Reads TYPESAFE_API_KEY. Built during init, so Alchemy binds it as a
// secret from your environment at deploy time.
const DecisionModelLive = TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(
  Layer.provide(TypeSafeClient.layerConfig()),
  Layer.provide(FetchHttpClient.layer),
);

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.url, workersDev: false },
  Effect.gen(function* () {
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Routes.pipe(
          Layer.provide(Search.layer),
          Layer.provide(DecisionModelLive),
          Layer.provide(Documents.layer),
          Layer.provide(PasteSession.layer),
        ),
      ),
    };
  }),
);
