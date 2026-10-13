// The Cloudflare Worker. Init (the outer Effect) runs at deploy time and at
// isolate boot: it declares the assets, the PasteSession Durable Object, and
// the TYPESAFE_API_KEY secret, and builds the router once. `fetch` then
// handles each request with that router.

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
  {
    main: import.meta.url,
    // public/ is served by Cloudflare's asset layer before the Worker runs,
    // except the page itself, which the Worker serves to set the session
    // cookie (lib/Routes.ts).
    assets: { directory: "./public", runWorkerFirst: ["/", "/index.html"] },
  },
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
