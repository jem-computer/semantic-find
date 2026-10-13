import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Decision, DecisionModel } from "effect/ai";
import type { Doc } from "../lib/Document";
import { Search, type SearchMode } from "../lib/Search";

const doc = (lines: ReadonlyArray<string>, kind: Doc["kind"] = "code"): Doc => ({
  id: "fixture",
  title: "Fixture",
  source: "test",
  url: "",
  kind,
  lines,
});

const usage = { inputTokens: 120, outputTokens: 3 };

// A real DecisionModel (so provider answers go through its validation) over
// a scripted provider that records what it was asked.
const harness = (respond: (options: DecisionModel.ProviderOptions) => DecisionModel.ProviderResponse) => {
  const calls: Array<DecisionModel.ProviderOptions> = [];
  const model = Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: (options) =>
        Effect.sync(() => {
          calls.push(options);
          return respond(options);
        }),
    }),
  );
  const run = (d: Doc, query: string, mode: SearchMode) =>
    Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Search).run(d, query, mode);
      }).pipe(
        Effect.provide(Search.layer.pipe(Layer.provide(model))),
      ),
    );
  const runFailure = (d: Doc, query: string, mode: SearchMode) =>
    Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.flip((yield* Search).run(d, query, mode));
      }).pipe(
        Effect.provide(Search.layer.pipe(Layer.provide(model))),
      ),
    );
  return { calls, run, runFailure };
};

const levelsOf = (decision: Decision.Any) => {
  if (decision._tag !== "Rate") throw new Error(`expected Rate, got ${decision._tag}`);
  return decision.criteria;
};

describe("choice mode", () => {
  const lines = ["alpha", "", "beta", "gamma"];
  const respond = (): DecisionModel.ProviderResponse => ({
    answers: {
      exists: { _tag: "Probability", probability: 0.9 },
      where: { _tag: "Classify", label: "L002", probabilities: { L000: 0.2, L002: 0.5, L003: 0.3 } },
    },
    usage,
  });

  test("sends the line-tagged document and classifies over non-blank line ids", async () => {
    const h = harness(respond);
    await h.run(doc(lines), "where is beta?", "choice");

    expect(h.calls).toHaveLength(1);
    const [{ state, decisions }] = h.calls;
    expect(state).toBe("L000| alpha\nL001| \nL002| beta\nL003| gamma");
    expect(Object.keys(decisions).sort()).toEqual(["exists", "where"]);
    const where = decisions.where;
    expect(where._tag).toBe("Classify");
    if (where._tag === "Classify") {
      expect(Object.keys(where.criteria)).toEqual(["L000", "L002", "L003"]);
      expect(where.instructions).toContain('"where is beta?"');
    }
  });

  test("maps the distribution onto every line, blanks scoring 0", async () => {
    const h = harness(respond);
    const result = await h.run(doc(lines), "where is beta?", "choice");

    expect(result.mode).toBe("choice");
    expect(result.exists).toBe(0.9);
    expect(result.scores).toEqual([0.2, 0, 0.5, 0.3]);
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(3);
  });

  test("fails with TooFewLines below two non-blank lines, without calling the model", async () => {
    const h = harness(respond);
    const error = await h.runFailure(doc(["only", ""]), "q", "choice");

    expect(error._tag).toBe("TooFewLines");
    expect(h.calls).toHaveLength(0);
  });

  test("surfaces provider distributions that don't sum to 1 as an AiError", async () => {
    const h = harness(() => ({
      answers: {
        exists: { _tag: "Probability", probability: 0.9 },
        where: { _tag: "Classify", label: "L000", probabilities: { L000: 0.2, L002: 0.1, L003: 0.1 } },
      },
      usage,
    }));
    const error = await h.runFailure(doc(lines), "q", "choice");

    expect(error._tag).toBe("AiError");
  });
});

describe("score mode", () => {
  const lines = ["alpha", "", "beta"];

  // Distribution over the rubric levels, lowest to highest.
  const rated = (levels: ReadonlyArray<string>, p: [number, number, number, number]) => ({
    _tag: "Rate" as const,
    rating: p.reduce((sum, x, i) => sum + x * i, 0),
    probabilities: Object.fromEntries(levels.map((level, i) => [level, p[i]])),
  });

  const respond = (options: DecisionModel.ProviderOptions): DecisionModel.ProviderResponse => {
    const levels = levelsOf(options.decisions.L000);
    return {
      answers: {
        exists: { _tag: "Probability", probability: 0.4 },
        L000: rated(levels, [0.1, 0.2, 0.3, 0.4]),
        L002: rated(levels, [0.7, 0.3, 0, 0]),
      },
      usage,
    };
  };

  test("rates each non-blank line against the same 4-level rubric", async () => {
    const h = harness(respond);
    await h.run(doc(lines), "q", "score");

    const { decisions } = h.calls[0];
    expect(Object.keys(decisions).sort()).toEqual(["L000", "L002", "exists"]);
    expect(levelsOf(decisions.L000)).toHaveLength(4);
    expect(levelsOf(decisions.L002)).toEqual(levelsOf(decisions.L000));
    expect(decisions.L002.instructions).toContain("line L002");
  });

  test("heat is P(direct) + 0.4 · P(context)", async () => {
    const h = harness(respond);
    const result = await h.run(doc(lines), "q", "score");

    expect(result.mode).toBe("score");
    expect(result.exists).toBe(0.4);
    expect(result.scores[0]).toBeCloseTo(0.4 + 0.4 * 0.3);
    expect(result.scores[1]).toBe(0);
    expect(result.scores[2]).toBe(0);
  });

  test("works on a single-line document", async () => {
    const h = harness((options) => ({
      answers: {
        exists: { _tag: "Probability", probability: 0.8 },
        L000: rated(levelsOf(options.decisions.L000), [0, 0, 0, 1]),
      },
      usage,
    }));
    const result = await h.run(doc(["only"]), "q", "score");

    expect(result.scores).toEqual([1]);
  });
});

describe("exists question", () => {
  const respond = (): DecisionModel.ProviderResponse => ({
    answers: {
      exists: { _tag: "Probability", probability: 0.5 },
      where: { _tag: "Classify", label: "L000", probabilities: { L000: 0.5, L001: 0.5 } },
    },
    usage,
  });

  test("code asks whether a line matches a description", async () => {
    const h = harness(respond);
    await h.run(doc(["a", "b"], "code"), "retries on failure", "choice");

    expect(h.calls[0].decisions.exists.instructions).toContain("match this description");
  });

  test("prose asks whether a line answers the question", async () => {
    const h = harness(respond);
    await h.run(doc(["a", "b"], "prose"), "who wins?", "choice");

    expect(h.calls[0].decisions.exists.instructions).toContain("address or answer");
  });
});
