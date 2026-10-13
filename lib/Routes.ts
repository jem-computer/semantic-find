// HTTP surface. Handlers stay thin: decode the request, call Documents or
// Search, and map typed failures to the plain-text error bodies the frontend
// shows as-is.

import { Duration, Effect, Layer, Path, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpStaticServer } from "effect/http";
import { Documents, PasteInput } from "./Documents";
import { Search, SearchMode } from "./Search";

const SESSION_COOKIE = "sf_sid";

// Pasted documents are scoped to this cookie. Calls without a browser
// session (curl) share one paste bucket.
const sessionId = Effect.map(HttpServerRequest.HttpServerRequest, (req) => req.cookies[SESSION_COOKIE] ?? "cli");

const text = (body: string, status: number) => Effect.succeed(HttpServerResponse.text(body, { status }));

const DocParams = Schema.Struct({ id: Schema.String });

const SearchRequest = Schema.Struct({
  docId: Schema.String,
  query: Schema.String,
  mode: Schema.optionalKey(SearchMode),
});

const ApiRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const documents = yield* Documents;
    const search = yield* Search;

    yield* router.add(
      "GET",
      "/api/docs",
      Effect.gen(function* () {
        const docs = yield* documents.list(yield* sessionId);
        return yield* HttpServerResponse.json(
          docs.map(({ id, title, source, url, kind, lines, pasted }) => ({
            id,
            title,
            source,
            url,
            kind,
            pasted: !!pasted,
            lineCount: lines.length,
          })),
        );
      }),
    );

    yield* router.add(
      "POST",
      "/api/docs",
      Effect.gen(function* () {
        const input = yield* HttpServerRequest.schemaBodyJson(PasteInput);
        const { doc, truncated } = yield* documents.paste(yield* sessionId, input);
        return yield* HttpServerResponse.json({ ...doc, truncated });
      }).pipe(
        Effect.catchTags({
          SchemaError: () => text("invalid request", 400),
          InvalidPaste: (e) => text(e.message, 400),
        }),
      ),
    );

    yield* router.add(
      "GET",
      "/api/docs/:id",
      Effect.gen(function* () {
        const { id } = yield* HttpRouter.schemaPathParams(DocParams);
        return yield* HttpServerResponse.json(yield* documents.get(yield* sessionId, id));
      }).pipe(
        Effect.catchTags({
          SchemaError: () => text("not found", 404),
          DocNotFound: () => text("not found", 404),
        }),
      ),
    );

    yield* router.add(
      "POST",
      "/api/search",
      Effect.gen(function* () {
        const { docId, query, mode = "choice" } = yield* HttpServerRequest.schemaBodyJson(SearchRequest);
        const doc = yield* documents.get(yield* sessionId, docId);
        const q = query.trim();
        if (!q || query.length > 500) return yield* text("bad query", 400);
        const [elapsed, result] = yield* Effect.timed(search.run(doc, q, mode));
        return yield* HttpServerResponse.json({
          ...result,
          usage: { input_tokens: result.usage.inputTokens ?? 0, output_tokens: result.usage.outputTokens ?? 0 },
          ms: Math.round(Duration.toMillis(elapsed)),
        });
      }).pipe(
        Effect.catchTags({
          SchemaError: () => text("bad request", 400),
          DocNotFound: () => text("unknown doc", 404),
          TooFewLines: (e) => text(e.message, 400),
          AiError: (e) => Effect.logError("search failed", e).pipe(Effect.andThen(text(String(e), 502))),
        }),
      ),
    );
  }),
);

// The page itself. Every load gets a fresh session cookie, which scopes
// pasted documents to this visit.
const PageRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const path = yield* Path.Path;
    const index = path.join(import.meta.dir, "..", "public", "index.html");
    const page = Effect.gen(function* () {
      const res = yield* HttpServerResponse.file(index, { contentType: "text/html; charset=utf-8" });
      return yield* HttpServerResponse.setCookie(res, SESSION_COOKIE, crypto.randomUUID(), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: "1 day",
      });
    });
    yield* router.add("GET", "/", page);
    yield* router.add("GET", "/index.html", page);
  }),
);

const StaticFiles = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return HttpStaticServer.layer({ root: path.join(import.meta.dir, "..", "public"), index: undefined });
  }),
);

export const Routes = Layer.mergeAll(ApiRoutes, PageRoutes, StaticFiles);
