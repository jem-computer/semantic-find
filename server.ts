// Semantic Find — Bun server. Serves the static frontend and proxies search
// queries to TypeSafe so the API key never reaches the browser.
//
//   lib/Documents.ts  sample catalog + per-session pasted documents
//   lib/Search.ts     the Decision definitions answered by TypeSafe
//   lib/Routes.ts     HTTP routes and static files

import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { Documents } from "./lib/Documents";
import { PasteStore } from "./lib/PasteStore";
import { Routes } from "./lib/Routes";
import { Search } from "./lib/Search";

// Reads TYPESAFE_API_KEY; startup fails if it is missing.
const DecisionModelLive = TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(
  Layer.provide(TypeSafeClient.layerConfig()),
  Layer.provide(FetchHttpClient.layer),
);

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(4310));
    return BunHttpServer.layer({ port });
  }),
);

const Main = HttpRouter.serve(Routes).pipe(
  Layer.provide(Search.layer),
  Layer.provide(DecisionModelLive),
  Layer.provide(Documents.layer),
  Layer.provide(PasteStore.layer),
  Layer.provide(ServerLive),
);

BunRuntime.runMain(Layer.launch(Main));
