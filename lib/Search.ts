// Each search sends the whole line-tagged document as input in one decision
// call. Two search modes, toggleable in the UI:
//
//   choice (relative) — one Classify over every line id ("which line answers
//     this?"). Its probability distribution is the heatmap; scores sum to 1,
//     so they rank lines against each other.
//   score (absolute) — one Rate per line against a fixed relevance rubric.
//     Every line gets an independent reading; nothing is forced to win.
//
// Both modes carry the same paired probability ("does any such line exist?"),
// which decides whether the answer is present at all.
// Lines are judged with the full document as context, so an answer that
// depends on a definition elsewhere in the document still resolves.

import { Context, Effect, Layer, Schema } from "effect";
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

const scoreDefinition = (doc: Doc, query: string, ids: ReadonlyArray<LineId>) => {
  const perLine: Record<LineId, Decision.Rate<Relevance>> = Object.fromEntries(
    ids.map((id) => [
      id,
      Decision.rate({
        instructions: `How directly does line ${id} of the document address: "${query}"?`,
        criteria: RELEVANCE,
      }),
    ]),
  );
  const decisions: { readonly exists: Decision.Probability } & Record<LineId, Decision.Rate<Relevance>> = {
    ...perLine,
    exists: exists(doc, query),
  };
  return Decision.make({ input: Schema.String, decisions });
};

export class Search extends Context.Service<
  Search,
  {
    readonly run: (
      doc: Doc,
      query: string,
      mode: SearchMode,
    ) => Effect.Effect<SearchResult, AiError.AiError | TooFewLines>;
  }
>()("semantic-find/Search") {
  static readonly layer = Layer.effect(
    Search,
    Effect.gen(function* () {
      const model = yield* DecisionModel.DecisionModel;

      const run = Effect.fn("Search.run")(function* (doc: Doc, query: string, mode: SearchMode) {
        yield* Effect.annotateCurrentSpan({ docId: doc.id, mode });
        const input = doc.lines.map((l, i) => `${lineId(i)}| ${l}`).join("\n");
        // Blank lines (kept in code docs for display fidelity) aren't judged.
        const judged = doc.lines.map((l) => l.trim().length > 0);
        const ids = doc.lines.flatMap((_, i) => (judged[i] ? [lineId(i)] : []));

        if (mode === "choice") {
          if (ids.length < 2) {
            return yield* new TooFewLines({ message: "choice mode needs at least two non-blank lines" });
          }
          const { answers, usage } = yield* model.decide(choiceDefinition(doc, query, ids), { input });
          const probs = answers.where.probabilities;
          return {
            mode,
            exists: answers.exists.probability,
            scores: doc.lines.map((_, i) => (judged[i] ? probs[lineId(i)] : 0)),
            usage,
          };
        }

        const { answers, usage } = yield* model.decide(scoreDefinition(doc, query, ids), { input });
        return {
          mode,
          exists: answers.exists.probability,
          scores: doc.lines.map((_, i) => (judged[i] ? scoreHeat(answers[lineId(i)].probabilities) : 0)),
          usage,
        };
      });

      return Search.of({ run });
    }),
  );
}
