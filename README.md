# Semantic Find

Ask a document a question in plain English and get a heatmap of where the
answer lives, plus a "not in this document" verdict when it isn't there.

Built on [TypeSafe](https://docs.typesafe.ai)'s `jev-latest` System One model
through Effect's `DecisionModel` (`@effect/ai-typesafe`). The frontend is a
[Foldkit](https://foldkit.dev) app; both deploy to Cloudflare Workers with
[Alchemy](https://alchemy.run).

## Run

Requires [Bun](https://bun.sh) and a TypeSafe API key.

```sh
bun install
cp .env.example .env   # then set TYPESAFE_API_KEY
bun run dev            # app + API on http://localhost:1337 (Vite HMR)
bun run test           # API tests
bun run typecheck      # API typecheck
```

The Foldkit app has its own checks, run from `web/`:

```sh
cd web
bun run format && bun run lint && bun run typecheck && bun run test
```

Deploy with `bun run deploy` (needs a Cloudflare login; `TYPESAFE_API_KEY` is
read from your environment and bound to the API Worker as a secret). Tear down
with `bun run destroy`.

Two Workers deploy (`alchemy.run.ts`):

- **Website**: the Foldkit app's static build, plus a small Worker
  (`web/worker/worker.ts`) that runs only for `/api/*` and forwards those
  requests to the API Worker over a service binding.
- **Worker**: the Effect API (`lib/RouterWorker.ts`), with no public URL.

## How it works

All TypeSafe usage lives in `lib/Search.ts`, as `Decision` definitions
answered by the `DecisionModel` service. The server proxies searches so the
API key stays out of the browser.

- The **whole line-tagged document** is the request's state, one request per
  search. Each line is prefixed with an id (`L000| ...`). Lines are judged
  with the full document as context, so answers that depend on a definition
  elsewhere in the document still resolve.
- Two search modes, toggleable in the UI:
  - **which line? (Choice, relative)**: one `Decision.classify` over every line id. Its
    probability distribution *is* the heatmap. Probabilities sum to 1, so
    lines are ranked against each other. Suits pinpointing a single answer.
  - **score each line (Score, absolute)**: one `Decision.rate` per line
    against a 4-level relevance rubric, all in the same request. Every line
    gets an independent reading, so whole evidence chains light up (try
    "what was the root cause of the outage?" on the incident log). Heat reads
    the level probabilities (`P(direct) + 0.4·P(context)`) rather than the
    expected score, which compresses toward the middle on topical documents.
- Both modes carry a paired **exists** `Decision.probability` ("does any line
  address this?"). A classify always selects some line, so this is the signal that decides
  whether the answer is present at all.
- The verdict is three-way in `web/src/domain/search.ts`: answered (exists ≥ 0.7),
  partially addressed, or not in this document (exists < 0.35).

Choice mode returns in roughly 0.3 s on a ~200-line document; score mode
(one question per line) in roughly 0.5–1.5 s.

## Documents

Sample documents live in `docs/*.json`, each a list of lines with a `kind`
(`prose` | `markdown` | `log` | `code`) that drives rendering:

- **GitHub Terms of Service / Firefox Privacy Notice / Wikimedia Terms of
  Use**: legal prose.
- **World News Wire**: four Wikinews articles (CC BY 2.5) as markdown.
- **Incident Log, api-gateway**: a synthetic ops log with a config mistake
  buried in noise, plus a deploy red herring.
- **order_service.py**: deliberately mixed-quality code (source in
  `docs/src/`) with real bugs, duplication, and clean spots for contrast.
  Code documents use a "does any line match this description?" exists
  question, which reads code more reliably than "does any line answer this?"

**Paste your own** from the sidebar. Text is split into lines server-side
(`lib/chunk.ts`, up to 240 lines / 60k characters) and stored in a Durable
Object per browser session, private to that session and deleted after two
idle hours. Choose **code** to keep lines
verbatim, with indentation preserved and syntax highlighting.

## Layout

- `alchemy.run.ts`: the Alchemy stack (deploys the Worker)
- `lib/RouterWorker.ts`: the Worker: assets, secret, and layer wiring
- `lib/Routes.ts`: HTTP routes, including `POST /api/session`, which the app
  calls at boot to get a fresh paste session per page load
- `lib/Search.ts`: `Search` service and the TypeSafe decision definitions
- `lib/Documents.ts`: `Documents` service (sample catalog + pastes)
- `lib/PasteStore.ts`: the pasted-documents contract (+ in-memory version for tests)
- `lib/PasteSession.ts`: the per-session Durable Object behind it
- `lib/Document.ts`: document schema and errors
- `docs/index.ts`: bundles the sample docs into the Worker
- `lib/chunk.ts`: text and code → lines
- `web/`: the Foldkit frontend (own package in a Bun workspace, because
  Foldkit pins `effect` 4.0.0 while the API uses 4.0.1)
  - `src/main.ts`: init, update, Subscriptions; `src/view/`: views
  - `src/command.ts`: API calls, scrolling, the line flash timer
  - `src/domain/`: heat maths, minimap layout, inline markdown, highlighting
  - `src/style/`: [Pleat](https://github.com/Manzanita-Research/pleat) styles
    and design tokens; `src/styles.css` only imports fonts and the
    highlight.js theme
  - `worker/worker.ts`: forwards `/api/*` to the API Worker
