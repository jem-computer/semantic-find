import { Array, Match, Number, Order, Schema, pipe } from 'effect'

export const SearchMode = Schema.Literals(['Choice', 'Score'])
export type SearchMode = typeof SearchMode.Type

export const SearchResult = Schema.Struct({
  mode: SearchMode,
  exists: Schema.Number,
  scores: Schema.Array(Schema.Number),
  elapsedMs: Schema.Number,
  inputTokens: Schema.Number,
})
export type SearchResult = typeof SearchResult.Type

const Verdict = Schema.Literals(['Answered', 'Partial', 'Absent'])
export type Verdict = typeof Verdict.Type

const EXISTS_ANSWERED = 0.7
const EXISTS_ABSENT = 0.35
const HOT_CHOICE = 0.05
const HOT_SCORE = 0.45
const SCORE_FLOOR = 0.25
const CHOICE_HEAT_CUTOFF = 0.03
const CHOICE_HEAT_EXPONENT = 0.7
const MIN_MAX_SCORE = 1e-6
const TOP_MATCH_COUNT = 5
const CHOICE_MATCH_RELATIVE = 0.08
const CHOICE_MATCH_ABSOLUTE = 0.01
const SCORE_MATCH_MIN = 0.3
const MIN_BAR_PERCENT = 3
const PERCENT = 100

const verdictOf = (exists: number): Verdict =>
  Match.value(exists).pipe(
    Match.withReturnType<Verdict>(),
    Match.when(
      Number.isGreaterThanOrEqualTo(EXISTS_ANSWERED),
      () => 'Answered',
    ),
    Match.when(Number.isLessThan(EXISTS_ABSENT), () => 'Absent'),
    Match.orElse(() => 'Partial'),
  )

export type LineHeat = Readonly<{
  heat: number
  isHot: boolean
  badge: string
}>

export type TopMatch = Readonly<{
  lineIndex: number
  badge: string
  barPercent: number
}>

export type Heatmap = Readonly<{
  verdict: Verdict
  isAbsent: boolean
  lines: ReadonlyArray<LineHeat>
  topMatches: ReadonlyArray<TopMatch>
}>

const maxScore = (scores: ReadonlyArray<number>): number =>
  Array.reduce(scores, MIN_MAX_SCORE, Number.max)

// NOTE: score-mode values are P(direct) + 0.4·P(context) per line. Everything
// under the floor renders dark so topical chatter doesn't wash the document;
// above it, heat is absolute. Choice heat is relative to the best line.
const heatOf = (mode: SearchMode, score: number, max: number): number =>
  Match.value(mode).pipe(
    Match.withReturnType<number>(),
    Match.when('Choice', () =>
      score / max < CHOICE_HEAT_CUTOFF
        ? 0
        : Math.pow(score / max, CHOICE_HEAT_EXPONENT),
    ),
    Match.when('Score', () =>
      Math.max(0, (score - SCORE_FLOOR) / (1 - SCORE_FLOOR)),
    ),
    Match.exhaustive,
  )

const isHotScore = (mode: SearchMode, score: number): boolean =>
  Match.value(mode).pipe(
    Match.withReturnType<boolean>(),
    Match.when('Choice', () => score >= HOT_CHOICE),
    Match.when('Score', () => score >= HOT_SCORE),
    Match.exhaustive,
  )

const isMatch = (mode: SearchMode, score: number, max: number): boolean =>
  Match.value(mode).pipe(
    Match.withReturnType<boolean>(),
    Match.when(
      'Choice',
      () =>
        score / max > CHOICE_MATCH_RELATIVE && score > CHOICE_MATCH_ABSOLUTE,
    ),
    Match.when('Score', () => score >= SCORE_MATCH_MIN),
    Match.exhaustive,
  )

const barShare = (mode: SearchMode, score: number, max: number): number =>
  Match.value(mode).pipe(
    Match.withReturnType<number>(),
    Match.when('Choice', () => score),
    Match.when('Score', () => heatOf(mode, score, max)),
    Match.exhaustive,
  )

const toBadge = (score: number): string => `${Math.round(score * PERCENT)}%`

type ScoredLine = Readonly<{ score: number; lineIndex: number }>

const byScoreDescending = Order.mapInput(
  Order.flip(Number.Order),
  ({ score }: ScoredLine) => score,
)

export const toHeatmap = ({ mode, exists, scores }: SearchResult): Heatmap => {
  const max = maxScore(scores)
  const verdict = verdictOf(exists)
  const isAbsent = verdict === 'Absent'

  const lines = Array.map(scores, score => ({
    heat: heatOf(mode, score, max),
    isHot: isHotScore(mode, score) && !isAbsent,
    badge: toBadge(score),
  }))

  const topMatches = pipe(
    scores,
    Array.map((score, lineIndex): ScoredLine => ({ score, lineIndex })),
    Array.sort(byScoreDescending),
    Array.take(TOP_MATCH_COUNT),
    Array.filter(({ score }) => isMatch(mode, score, max)),
    Array.map(({ score, lineIndex }) => ({
      lineIndex,
      badge: toBadge(score),
      barPercent: Math.max(
        MIN_BAR_PERCENT,
        barShare(mode, score, max) * PERCENT,
      ),
    })),
  )

  return { verdict, isAbsent, lines, topMatches }
}
