# Semantic Find

Ask a document a question in plain English and get a heatmap of where the
answer lives, plus a "not in this document" verdict when it isn't there.

Built on [TypeSafe](https://docs.typesafe.ai)'s `jev-latest` System One model
through Effect's `DecisionModel` (`@effect/ai-typesafe`), served with
`@effect/platform-bun`.

## Run

Requires [Bun](https://bun.sh) and a TypeSafe API key.

```sh
bun install
cp .env.example .env   # then set TYPESAFE_API_KEY
bun run dev
bun run typecheck
```

Serves on http://localhost:4310 (override with `PORT`).

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
- The verdict is three-way in `public/app.js`: answered (exists ≥ 0.7),
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
(`lib/chunk.ts`, up to 240 lines / 60k characters) and held in memory,
private to the pasting browser session. Choose **code** to keep lines
verbatim, with indentation preserved and syntax highlighting.

## Layout

- `server.ts`: layer wiring and entry point (`Layer.launch`)
- `lib/Routes.ts`: HTTP routes, session cookie, static files
- `lib/Search.ts`: `Search` service and the TypeSafe decision definitions
- `lib/Documents.ts`: `Documents` service (sample catalog + pastes)
- `lib/PasteStore.ts`: per-session pasted documents
- `lib/Document.ts`: document schema and errors
- `lib/chunk.ts`: text and code → lines
- `public/`: vanilla JS frontend (document view, heatmap, minimap)
