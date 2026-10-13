// Semantic Find — Bun server. Serves the static frontend and proxies search
// queries to TypeSafe so the API key never reaches the browser.
//
// Each search sends the whole line-tagged document as state in one request.
// Two search modes, toggleable in the UI:
//
//   choice (relative) — one Choice over every line id ("which line answers
//     this?"). Its probability distribution is the heatmap; scores sum to 1,
//     so they rank lines against each other.
//   score (absolute) — one Score question per line against a fixed relevance
//     rubric. Every line gets an independent 0-3 relevance reading; nothing
//     is forced to win.
//
// Both modes carry the same paired Noul ("does any such line exist?"), which
// decides whether the answer is present at all.
// Lines are judged with the full document as context, so an answer that
// depends on a definition elsewhere in the document still resolves.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TypeSafeClient, type ChoiceResponse, type NoulResponse, type Questions, type ScoreResponse } from "@typesafe-ai/sdk";
import { MAX_LINES, MAX_PASTE_CHARS, codeToLines, textToLines } from "./lib/chunk";
import { SESSION_COOKIE, createPasteStore, readSid } from "./lib/paste-store";

if (!process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set (expected in .env)");
  process.exit(1);
}

const MODEL = "jev-latest";
const client = new TypeSafeClient();

interface Doc {
  id: string;
  title: string;
  source: string;
  url: string;
  kind: "prose" | "markdown" | "log" | "code";
  lines: string[];
  pasted?: boolean;
}

const DOCS = new Map<string, Doc>();
for (const f of readdirSync(join(import.meta.dir, "docs"))) {
  if (!f.endsWith(".json")) continue;
  const doc: Doc = JSON.parse(readFileSync(join(import.meta.dir, "docs", f), "utf8"));
  DOCS.set(doc.id, doc);
}
console.log(`Loaded ${DOCS.size} docs: ${[...DOCS.keys()].join(", ")}`);

// Pasted docs are scoped to the visitor's session — never listed to, or
// fetchable by, anyone else (lib/paste-store.ts).
const PASTES = createPasteStore<Doc>();
let pasteCounter = 0;

const lineId = (i: number) => `L${String(i).padStart(3, "0")}`;

// ---- Question text and rubrics ----
const WHERE_INSTRUCTIONS = (query: string) =>
  `Which line of the document contains the answer to: "${query}"?`;
const EXISTS_INSTRUCTIONS = (query: string) =>
  `Does any line of the document address or answer: "${query}"?`;
const EXISTS_CRITERIA = {
  true: "At least one line of the document states or directly implies the answer",
  false: "No line of the document addresses this",
};
// Code documents are asked whether a line matches a description, which suits
// code better than whether a line answers a question.
const EXISTS_INSTRUCTIONS_CODE = (query: string) =>
  `Does any line of the code match this description: "${query}"?`;
const EXISTS_CRITERIA_CODE = {
  true: "At least one line does or contains what is described",
  false: "No line matches the description",
};
const SCORE_INSTRUCTIONS = (query: string, id: string) =>
  `How directly does line ${id} of the document address: "${query}"?`;
const SCORE_CRITERIA = [
  "The line is unrelated to the question",
  "The line touches a related topic, but a reader hunting for the answer would skip past it",
  "The line does not itself answer the question, but the answer depends on it — a heading, definition, condition, or qualifier that changes how the answer reads",
  "The line itself directly addresses the question",
];
// Score-mode heat reads the level probabilities rather than the expected
// score, which sits mid-scale for every line of a topical document.
// P(direct) separates real candidates; context lines count at a discount.
const CONTEXT_WEIGHT = 0.4;
const scoreHeat = (p: Record<string, number>) => (p["3"] ?? 0) + CONTEXT_WEIGHT * (p["2"] ?? 0);

async function search(doc: Doc, query: string, mode: "choice" | "score") {
  const tagged = doc.lines.map((l, i) => `${lineId(i)}| ${l}`).join("\n");
  // Blank lines (kept in code docs for display fidelity) aren't scoreable.
  const scoreable = doc.lines.map((l) => l.trim().length > 0);

  const isCode = doc.kind === "code";
  const questions: Questions = {
    exists: {
      type: "noul",
      instructions: isCode ? EXISTS_INSTRUCTIONS_CODE(query) : EXISTS_INSTRUCTIONS(query),
      criteria: isCode ? EXISTS_CRITERIA_CODE : EXISTS_CRITERIA,
    },
  };

  if (mode === "choice") {
    const criteria: Record<string, null> = {};
    doc.lines.forEach((_, i) => scoreable[i] && (criteria[lineId(i)] = null));
    questions.where = { type: "choice", instructions: WHERE_INSTRUCTIONS(query), criteria };
  } else {
    doc.lines.forEach((_, i) => {
      if (!scoreable[i]) return;
      questions[lineId(i)] = {
        type: "score",
        instructions: SCORE_INSTRUCTIONS(query, lineId(i)),
        criteria: SCORE_CRITERIA,
      };
    });
  }

  const data = await client.systemOne({ state: tagged, model: MODEL, questions });

  // Both modes return scores in [0, 1], aligned with doc.lines. Choice scores
  // are shares of one probability mass; score-mode values are absolute.
  let scores: number[];
  if (mode === "choice") {
    const probs = (data.answers.where as ChoiceResponse).probabilities;
    scores = doc.lines.map((_, i) => probs[lineId(i)] ?? 0);
  } else {
    scores = doc.lines.map((_, i) =>
      scoreHeat((data.answers[lineId(i)] as ScoreResponse | undefined)?.probabilities ?? {}),
    );
  }

  return { mode, exists: (data.answers.exists as NoulResponse).noul, scores, usage: data.usage };
}

Bun.serve({
  port: Number(process.env.PORT ?? 4310),
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/docs" && req.method === "GET") {
      const sid = readSid(req) ?? "cli";
      const list = [...DOCS.values(), ...PASTES.list(sid)].map(({ id, title, source, url, kind, lines, pasted }) => ({
        id,
        title,
        source,
        url,
        kind,
        pasted: !!pasted,
        lineCount: lines.length,
      }));
      return Response.json(list);
    }

    // Paste-your-own document: chunked server-side, held in memory only,
    // visible only to the pasting session.
    if (url.pathname === "/api/docs" && req.method === "POST") {
      const { title, text, asCode } = await req.json();
      if (typeof text !== "string" || !text.trim()) {
        return new Response("empty document", { status: 400 });
      }
      if (text.length > MAX_PASTE_CHARS) {
        return new Response(`document too large (max ${MAX_PASTE_CHARS.toLocaleString()} chars)`, { status: 400 });
      }
      let lines = asCode ? codeToLines(text) : textToLines(text);
      let truncated = false;
      if (lines.length > MAX_LINES) {
        lines = lines.slice(0, MAX_LINES);
        truncated = true;
      }
      if (lines.length === 0) return new Response("empty document", { status: 400 });

      const logish = lines.filter((l) => /^\d{2}:\d{2}(:\d{2})?/.test(l)).length > lines.length / 2;
      const mdish = lines.some((l) => /^#{1,3} /.test(l));
      const doc: Doc = {
        id: `pasted-${++pasteCounter}`,
        title: (typeof title === "string" && title.trim().slice(0, 80)) || `Pasted document ${pasteCounter}`,
        source: "pasted (in memory, this visit only)",
        url: "",
        kind: asCode ? "code" : logish ? "log" : mdish ? "markdown" : "prose",
        lines,
        pasted: true,
      };
      PASTES.add(readSid(req) ?? "cli", doc);
      return Response.json({ ...doc, truncated });
    }

    const docMatch = url.pathname.match(/^\/api\/docs\/([\w-]+)$/);
    if (docMatch) {
      const doc = DOCS.get(docMatch[1]) ?? PASTES.get(readSid(req) ?? "cli", docMatch[1]);
      return doc ? Response.json(doc) : new Response("not found", { status: 404 });
    }

    if (url.pathname === "/api/search" && req.method === "POST") {
      try {
        const { docId, query, mode } = await req.json();
        // Calls without a browser session (curl) share one paste bucket.
        const sid = readSid(req) ?? "cli";
        const doc = DOCS.get(docId) ?? PASTES.get(sid, docId);
        if (!doc) return new Response("unknown doc", { status: 404 });
        if (typeof query !== "string" || !query.trim() || query.length > 500) {
          return new Response("bad query", { status: 400 });
        }
        const m = mode === "score" ? "score" : "choice";
        const t0 = performance.now();
        const result = await search(doc, query.trim(), m);
        return Response.json({ ...result, ms: Math.round(performance.now() - t0) });
      } catch (err) {
        console.error(err);
        return new Response(String(err), { status: 502 });
      }
    }

    // Static frontend. Every page load gets a fresh session cookie, which
    // scopes pasted documents to this visit.
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(import.meta.dir, "public", path));
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    const res = new Response(file);
    if (path === "/index.html") {
      res.headers.set(
        "Set-Cookie",
        `${SESSION_COOKIE}=${crypto.randomUUID()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      );
    }
    return res;
  },
});

console.log(`Semantic Find running on http://localhost:${process.env.PORT ?? 4310}`);
