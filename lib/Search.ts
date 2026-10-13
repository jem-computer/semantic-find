// Each search sends the whole line-tagged document as input in one decision
// call. Two search modes, toggleable in the UI:
//
//   choice (relative) — one Classify over every line id ("which line answers
//     this?"). Its probability distribution is the heatmap; scores sum to 1,
//     so they rank lines against each other.
//   score (absolute) — one Rate per line against a fixed relevance rubric.
//     Every line gets an independent reading; nothing is forced to win.
//     Clef answers at most 64 questions per request, so longer documents are
//     rated in parallel batches, each sending the whole document as context.
//
// Both modes carry the same paired probability ("does any such line exist?"),
// which decides whether the answer is present at all.
// Lines are judged with the full document as context, so an answer that
// depends on a definition elsewhere in the document still resolves.

import { Array, Context, Effect, Layer, Schema } from "effect";
import { AiError, Decision, DecisionModel } from "effect/ai";
import type { Doc } from "./Document";

export const SearchMode = Schema.Literals(["choice", "score"]);
export type SearchMode = typeof SearchMode.Type;

export interface SearchResult {
  readonly mode: SearchMode;
  readonly exists: number;
  /** Aligned with doc.lines, in [0, 1]. Choice scores share one probability
   * mass; score-mode values are absolute. */
  readonly scores: ReadonlyArray<number>;
  readonly usage: DecisionModel.DecisionUsage;
}

export class TooFewLines extends Schema.TaggedError<TooFewLines>()("TooFewLines", {
  message: Schema.String,
}) {}

type LineId = `L${string}`;
const lineId = (i: number): LineId => `L${String(i).padStart(3, "0")}`;

// ---- Question text and rubrics ----

const exists = (doc: Doc, query: string) =>
  doc.kind === "code"
    ? // Code documents are asked whether a line matches a description, which
      // suits code better than whether a line answers a question.
      Decision.probability({
        instructions: `Does any line of the code match this description: "${query}"?`,
        criteria: {
          true: "At least one line does or contains what is described",
          false: "No line matches the description",
        },
      })
    : Decision.probability({
        instructions: `Does any line of the document address or answer: "${query}"?`,
        criteria: {
          true: "At least one line of the document states or directly implies the answer",
          false: "No line of the document addresses this",
        },
      });

const RELEVANCE = [
  "The line is unrelated to the question",
  "The line touches a related topic, but a reader hunting for the answer would skip past it",
  "The line does not itself answer the question, but the answer depends on it — a heading, definition, condition, or qualifier that changes how the answer reads",
  "The line itself directly addresses the question",
] as const;
type Relevance = (typeof RELEVANCE)[number];

// Score-mode heat reads the level probabilities rather than the expected
// rating, which sits mid-scale for every line of a topical document.
// P(direct) separates real candidates; context lines count at a discount.
const CONTEXT_WEIGHT = 0.4;
const scoreHeat = (p: Decision.RateAnswer<Relevance>["probabilities"]) =>
  p[RELEVANCE[3]] + CONTEXT_WEIGHT * p[RELEVANCE[2]];

const choiceDefinition = (doc: Doc, query: string, ids: ReadonlyArray<LineId>) =>
  Decision.make({
    input: Schema.String,
    decisions: {
      exists: exists(doc, query),
      where: Decision.classify<LineId>({
        instructions: `Which line of the document contains the answer to: "${query}"?`,
        criteria: Object.fromEntries(ids.map((id) => [id, `Line ${id}`])),
      }),
    },
  });

// Clef's per-request question limit. The first batch also carries `exists`.
export const MAX_QUESTIONS = 64;

const rateLines = (query: string, ids: ReadonlyArray<LineId>): Record<LineId, Decision.Rate<Relevance>> =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      Decision.rate({
        instructions: `How directly does line ${id} of the document address: "${query}"?`,
        criteria: RELEVANCE,
      }),
    ]),
  );

const scoreDefinition = (doc: Doc, query: string, ids: ReadonlyArray<LineId>) => {
  const decisions: { readonly exists: Decision.Probability } & Record<LineId, Decision.Rate<Relevance>> = {
    ...rateLines(query, ids),
    exists: exists(doc, query),
  };
  return Decision.make({ input: Schema.String, decisions });
};

const rateDefinition = (query: string, ids: ReadonlyArray<LineId>) =>
  Decision.make({ input: Schema.String, decisions: rateLines(query, ids) });

const addUsage = (a: DecisionModel.DecisionUsage, b: DecisionModel.DecisionUsage) =>
  new DecisionModel.DecisionUsage({
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
  });

export class Search extends Context.Service<
  Search,
  {
    readonly run: (
      doc: Doc,
      query: string,
      mode: SearchMode,
    ) => Effect.Effect<SearchResult, AiError.AiError | TooFewLines, DecisionModel.DecisionModel>;
  }
>()("semantic-find/Search") {
  static readonly layer = Layer.succeed(
    Search,
    Search.of({
      // The decision model is provided per request (lib/RouterWorker.ts).
      run: Effect.fn("Search.run")(function* (doc: Doc, query: string, mode: SearchMode) {
        yield* Effect.annotateCurrentSpan({ docId: doc.id, mode });
        const input = doc.lines.map((l, i) => `${lineId(i)}| ${l}`).join("\n");
        // Blank lines (kept in code docs for display fidelity) aren't judged.
        const judged = doc.lines.map((l) => l.trim().length > 0);
        const ids = doc.lines.flatMap((_, i) => (judged[i] ? [lineId(i)] : []));

        if (mode === "choice") {
          if (ids.length < 2) {
            return yield* new TooFewLines({ message: "choice mode needs at least two non-blank lines" });
          }
          const { answers, usage } = yield* DecisionModel.decide(choiceDefinition(doc, query, ids), { input });
          const probs = answers.where.probabilities;
          return {
            mode,
            exists: answers.exists.probability,
            scores: doc.lines.map((_, i) => (judged[i] ? probs[lineId(i)] : 0)),
            usage,
          };
        }

        const firstIds = ids.slice(0, MAX_QUESTIONS - 1);
        const restBatches = Array.chunksOf(ids.slice(MAX_QUESTIONS - 1), MAX_QUESTIONS);
        const { first, rest } = yield* Effect.all(
          {
            first: DecisionModel.decide(scoreDefinition(doc, query, firstIds), { input }),
            rest: Effect.forEach(restBatches, (batch) => DecisionModel.decide(rateDefinition(query, batch), { input }), {
              concurrency: "unbounded",
            }),
          },
          { concurrency: "unbounded" },
        );

        const heatById = new Map<string, number>();
        for (const { answers } of [first, ...rest]) {
          for (const [id, answer] of Object.entries(answers)) {
            if ("probabilities" in answer) heatById.set(id, scoreHeat(answer.probabilities));
          }
        }
        return {
          mode,
          exists: first.answers.exists.probability,
          scores: doc.lines.map((_, i) => heatById.get(lineId(i)) ?? 0),
          usage: rest.reduce((total, { usage }) => addUsage(total, usage), first.usage),
        };
      }),
    }),
  );
}
