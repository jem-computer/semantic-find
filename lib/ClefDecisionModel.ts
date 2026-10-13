// Effect's DecisionModel answered by Cloudflare's Clef through the Workers AI
// binding. @effect/ai-cloudflare reaches Clef over the REST API with an
// account id and API token; this swaps its CloudflareClient for one that calls
// the binding instead, so no credentials are needed.
//
// The binding is only usable while a request is in flight, so the layer
// requires RuntimeContext and is provided per request (lib/RouterWorker.ts),
// the same way Alchemy's `ai.model(...)` LanguageModel layer is.

import { CloudflareClient, CloudflareDecisionModel, CloudflareSchema } from "@effect/ai-cloudflare";
import type { RuntimeContext } from "alchemy";
import type * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer, Schema } from "effect";
import { AiError, type DecisionModel } from "effect/ai";
import { FetchHttpClient, HttpClient } from "effect/http";

export const MODEL = "clef";

// Clef isn't in the Workers AI model catalog that types `Ai.run`, so the
// binding is called through this narrower shape.
interface ClefBinding {
  run(model: string, inputs: unknown): Promise<unknown>;
}

const decodeResponse = Schema.decodeUnknownEffect(CloudflareSchema.DecisionsResponse);

const bindingError = (cause: unknown) =>
  AiError.make({
    module: "ClefDecisionModel",
    method: "createDecisions",
    reason: new AiError.UnknownError({ description: String(cause) }),
  });

const bindingClient = (ai: Cloudflare.AIClient) =>
  Layer.effect(
    CloudflareClient.CloudflareClient,
    Effect.gen(function* () {
      const binding: ClefBinding = yield* ai.raw;
      return CloudflareClient.CloudflareClient.of({
        // NOTE: the decision model never uses this HTTP client; the service
        // shape requires one for callers that want raw REST access.
        client: yield* HttpClient.HttpClient,
        createDecisions: ({ model, state, questions }) =>
          Effect.tryPromise({
            try: () => binding.run(`@cf/cloudflare/${model}`, { state, questions }),
            catch: bindingError,
          }).pipe(
            Effect.flatMap((output) =>
              decodeResponse(output).pipe(
                Effect.mapError((error) =>
                  AiError.make({
                    module: "ClefDecisionModel",
                    method: "createDecisions",
                    reason: AiError.InvalidOutputError.fromSchemaError(error),
                  }),
                ),
              ),
            ),
          ),
      });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

export const layer = (ai: Cloudflare.AIClient): Layer.Layer<DecisionModel.DecisionModel, never, RuntimeContext> =>
  CloudflareDecisionModel.layer({ model: MODEL }).pipe(Layer.provide(bindingClient(ai)));
