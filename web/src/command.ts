import {
  Data,
  Duration,
  Effect,
  Match,
  Number,
  Option,
  Schema,
  String,
} from 'effect'
import {
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/http'
import { Command, Dom, Http } from 'foldkit'

import { Doc, Search } from './domain'
import { detectLanguage } from './highlight'
import { DOC_SCROLL_ID } from './ids'
import { Message } from './message'
import { PasteKind } from './model'

// WIRE

const WireDocKind = Schema.Literals(['prose', 'markdown', 'log', 'code'])
type WireDocKind = typeof WireDocKind.Type

const WireDocSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  lineCount: Schema.Number,
})

const WireDoc = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  source: Schema.String,
  url: Schema.String,
  kind: WireDocKind,
  lines: Schema.Array(Schema.String),
})
type WireDoc = typeof WireDoc.Type

const WireSearchResult = Schema.Struct({
  exists: Schema.Number,
  scores: Schema.Array(Schema.Number),
  ms: Schema.Number,
  usage: Schema.Struct({ input_tokens: Schema.Number }),
})

const WirePasted = Schema.Struct({
  id: Schema.String,
  lines: Schema.Array(Schema.String),
  truncated: Schema.Boolean,
})

const toDocKind = (kind: WireDocKind): Doc.DocKind =>
  Match.value(kind).pipe(
    Match.withReturnType<Doc.DocKind>(),
    Match.when('prose', () => 'Prose'),
    Match.when('markdown', () => 'Markdown'),
    Match.when('log', () => 'Log'),
    Match.when('code', () => 'Code'),
    Match.exhaustive,
  )

const toDoc = ({ id, title, source, url, kind, lines }: WireDoc): Doc.Doc => ({
  id,
  title,
  source,
  maybeUrl: Option.liftPredicate(url, String.isNonEmpty),
  kind: toDocKind(kind),
  lines,
})

const toWireMode = (mode: Search.SearchMode): string =>
  Match.value(mode).pipe(
    Match.withReturnType<string>(),
    Match.when('Choice', () => 'choice'),
    Match.when('Score', () => 'score'),
    Match.exhaustive,
  )

// HTTP

class RequestFailed extends Data.TaggedError('RequestFailed')<{
  message: string
}> {}

const GENERIC_FAILURE = 'request failed'
const FIRST_OK_STATUS = 200
const LAST_OK_STATUS = 299

const requireOk = (response: HttpClientResponse.HttpClientResponse) =>
  Number.between(response.status, {
    minimum: FIRST_OK_STATUS,
    maximum: LAST_OK_STATUS,
  })
    ? Effect.succeed(response)
    : Effect.flatMap(response.text, body =>
        Effect.fail(
          new RequestFailed({
            message: Option.getOrElse(
              Option.liftPredicate(body, String.isNonEmpty),
              () => GENERIC_FAILURE,
            ),
          }),
        ),
      )

const fetchJson = <A, I>(
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I>,
): Effect.Effect<A, string> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* Effect.flatMap(client.execute(request), requireOk)
    return yield* Schema.decodeUnknownEffect(schema)(yield* response.json)
  }).pipe(
    Effect.provide(Http.layer),
    Effect.mapError(error =>
      Match.value(error).pipe(
        Match.tag('RequestFailed', ({ message }) => message),
        Match.orElse(() => GENERIC_FAILURE),
      ),
    ),
  )

const postJson = <A, I>(
  url: string,
  body: unknown,
  schema: Schema.Codec<A, I>,
) =>
  Effect.flatMap(
    HttpClientRequest.bodyJson(HttpClientRequest.post(url), body).pipe(
      Effect.mapError(() => GENERIC_FAILURE),
    ),
    request => fetchJson(request, schema),
  )

// COMMAND

export const StartSession = Command.define('StartSession', {
  messages: [Message.CompletedStartSession],
  execute: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    yield* client.execute(HttpClientRequest.post('/api/session'))
  }).pipe(
    Effect.provide(Http.layer),
    Effect.ignore,
    Effect.as(Message.CompletedStartSession()),
  ),
})

export const FetchDocList = Command.define('FetchDocList', {
  messages: [Message.SucceededFetchDocList, Message.FailedFetchDocList],
  execute: fetchJson(
    HttpClientRequest.get('/api/docs'),
    Schema.Array(WireDocSummary),
  ).pipe(
    Effect.map(docs => Message.SucceededFetchDocList({ docs })),
    Effect.catch(error =>
      Effect.succeed(Message.FailedFetchDocList({ error })),
    ),
  ),
})

export const FetchDoc = Command.define('FetchDoc', {
  args: { docId: Schema.String },
  messages: [Message.SucceededFetchDoc, Message.FailedFetchDoc],
  execute: ({ docId }) =>
    fetchJson(
      HttpClientRequest.get(`/api/docs/${encodeURIComponent(docId)}`),
      WireDoc,
    ).pipe(
      Effect.map(toDoc),
      Effect.map(doc =>
        Message.SucceededFetchDoc({
          loadedDoc: {
            doc,
            maybeCodeLanguage:
              doc.kind === 'Code' ? detectLanguage(doc.lines) : Option.none(),
          },
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchDoc({ docId, error })),
      ),
    ),
})

export const RunSearch = Command.define('RunSearch', {
  args: {
    generation: Schema.Number,
    docId: Schema.String,
    query: Schema.String,
    mode: Search.SearchMode,
  },
  messages: [Message.SucceededRunSearch, Message.FailedRunSearch],
  execute: ({ generation, docId, query, mode }) =>
    postJson(
      '/api/search',
      { docId, query, mode: toWireMode(mode) },
      WireSearchResult,
    ).pipe(
      Effect.map(({ exists, scores, ms, usage }) =>
        Message.SucceededRunSearch({
          generation,
          result: {
            mode,
            exists,
            scores,
            elapsedMs: ms,
            inputTokens: usage.input_tokens,
          },
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRunSearch({ generation, error })),
      ),
    ),
})

export const CreatePaste = Command.define('CreatePaste', {
  args: { title: Schema.String, text: Schema.String, kind: PasteKind },
  messages: [Message.SucceededCreatePaste, Message.FailedCreatePaste],
  execute: ({ title, text, kind }) =>
    postJson(
      '/api/docs',
      { title, text, asCode: kind === 'Code' },
      WirePasted,
    ).pipe(
      Effect.map(({ id, lines, truncated }) =>
        Message.SucceededCreatePaste({
          docId: id,
          maybeTruncatedLineCount: Option.liftPredicate(
            lines.length,
            () => truncated,
          ),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCreatePaste({ error })),
      ),
    ),
})

export const ScrollLineIntoView = Command.define('ScrollLineIntoView', {
  args: { lineIndex: Schema.Number },
  messages: [Message.CompletedScrollLineIntoView],
  execute: ({ lineIndex }) =>
    Dom.scrollIntoView(`#${Doc.lineId(lineIndex)}`, { block: 'center' }).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedScrollLineIntoView()),
    ),
})

// NOTE: Dom has no scroll-to-offset helper. Scrubbing the minimap must move
// the document instantly: a smooth scroll restarts on every pointer move and
// trails the pointer.
export const ScrollDocTo = Command.define('ScrollDocTo', {
  args: { top: Schema.Number },
  messages: [Message.CompletedScrollDocTo],
  execute: ({ top }) =>
    Effect.sync(() => {
      const maybeScroller = Option.fromNullishOr(
        document.getElementById(DOC_SCROLL_ID),
      )
      if (Option.isSome(maybeScroller)) {
        maybeScroller.value.scrollTo({ top, behavior: 'instant' })
      }
    }).pipe(Effect.as(Message.CompletedScrollDocTo())),
})

const FLASH_DURATION = Duration.millis(1600)

export const WaitBeforeUnflash = Command.define('WaitBeforeUnflash', {
  args: { flashId: Schema.Number },
  messages: [Message.CompletedWaitBeforeUnflash],
  execute: ({ flashId }) =>
    Effect.sleep(FLASH_DURATION).pipe(
      Effect.as(Message.CompletedWaitBeforeUnflash({ flashId })),
    ),
})
