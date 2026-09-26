import type { QuestionType } from "@readi/shared-types";

/**
 * Which questions a session asks (spec §4.3, kickoff #16). Pure and deterministic given a seed, so
 * a session can be replayed exactly and a test can assert on a specific outcome rather than on a
 * property.
 *
 * The eligibility half of the rule — published, rubric published, role, level and **stack** — is
 * not here. It is `question-eligibility.ts` and the query in `interview-sessions.repository.ts`,
 * reused rather than rewritten (ADR-0015): this file receives a pool that already passed it and
 * decides which of those to ask, in which order.
 *
 * Four things shape a choice, in this order:
 *
 * 1. **Spread the types.** A mixed session that asks four technical questions is not mixed. Slots
 *    go round the requested types, each slot taking the type that has been asked least so far.
 * 2. **Nothing asked in the last three sessions**, while anything else remains.
 * 3. **Lean toward weak topics**, and away from a topic this session has already used.
 * 4. **When the fresh questions run out, take the least recently seen** — never end early, never
 *    fail, and never repeat a question inside one session.
 *
 * Point 4 is not an edge case. Backend at intern-junior offers 18 questions, 14 of them general
 * (closing handover, 2026-09-25), so a candidate practising there reaches the fallback in their
 * fourth session. `question-selection.spec.ts` runs consecutive sessions against a pool that
 * small and asserts what a candidate actually gets.
 */

export interface SelectableQuestion {
  questionId: string;
  topicId: string;
  type: QuestionType;
  /** 1–5. Not a criterion today; carried so a later pass can grade a session without a migration. */
  difficulty: number;
  /** When this candidate was last asked it, or null if never. */
  lastSeenAt: Date | null;
  /** Asked in one of this candidate's last N sessions (`INTERVIEW_LIMITS.recentSessionsExcluded`). */
  seenRecently: boolean;
}

export interface SelectionInput {
  pool: readonly SelectableQuestion[];
  /** How many to ask; fewer come back when the pool is smaller, which is not an error here. */
  count: number;
  /** `InterviewSession.selection_seed`. The same seed and pool always give the same questions. */
  seed: string;
  /** The types this session may use. At least one; all of the role's is the mixed session. */
  types: readonly QuestionType[];
  /**
   * Topics this candidate scores badly on. The input exists now and is **empty until M4** has
   * evaluations to derive it from — wiring it later would mean changing this signature and every
   * test that calls it, for no gain.
   */
  weakTopicIds?: readonly string[];
}

/** A weak topic is three times as likely to come up as any other. */
const WEAK_TOPIC_WEIGHT = 3;
/**
 * A topic this session has already asked about is a quarter as likely to come up again. A penalty
 * rather than a ban: with a thin pool — backend at intern-junior again — banning a topic can leave
 * a slot unfillable, and two questions on one topic is a worse session than a short one only when
 * there was an alternative.
 */
const TOPIC_REPEAT_PENALTY = 0.25;

export function selectQuestions(input: SelectionInput): SelectableQuestion[] {
  const { pool, count, seed, types } = input;
  const weakTopics = new Set(input.weakTopicIds ?? []);
  const random = seededRandom(seed);

  const remaining = new Map(pool.map((question) => [question.questionId, question]));
  const picked: SelectableQuestion[] = [];
  const usedTopics = new Set<string>();
  const askedPerType = new Map<QuestionType, number>(types.map((type) => [type, 0]));

  while (picked.length < count && remaining.size > 0) {
    const available = [...remaining.values()];
    const type = nextType(askedPerType, available);
    const ofType = type ? available.filter((question) => question.type === type) : available;
    /*
     * `ofType` can only be empty when `nextType` found no type with anything left, which means the
     * requested types and the pool have stopped overlapping — the session is as long as it can be.
     */
    if (ofType.length === 0) break;

    const fresh = ofType.filter((question) => !question.seenRecently);
    const choice =
      fresh.length > 0
        ? weightedChoice(fresh, random, (question) => weightOf(question, weakTopics, usedTopics))
        : leastRecentlySeen(ofType);

    picked.push(choice);
    remaining.delete(choice.questionId);
    usedTopics.add(choice.topicId);
    askedPerType.set(choice.type, (askedPerType.get(choice.type) ?? 0) + 1);
  }
  return picked;
}

/**
 * The type whose turn it is: the one asked least so far that still has a question left. Ties go to
 * the order the caller listed them, so the same request always produces the same rotation.
 */
function nextType(
  askedPerType: ReadonlyMap<QuestionType, number>,
  available: readonly SelectableQuestion[],
): QuestionType | null {
  let best: QuestionType | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const [type, asked] of askedPerType) {
    if (asked >= bestCount) continue;
    if (!available.some((question) => question.type === type)) continue;
    best = type;
    bestCount = asked;
  }
  return best;
}

function weightOf(
  question: SelectableQuestion,
  weakTopics: ReadonlySet<string>,
  usedTopics: ReadonlySet<string>,
): number {
  let weight = 1;
  if (weakTopics.has(question.topicId)) weight *= WEAK_TOPIC_WEIGHT;
  if (usedTopics.has(question.topicId)) weight *= TOPIC_REPEAT_PENALTY;
  return weight;
}

/**
 * The fallback, and deliberately **not** random: when everything left has been asked recently, the
 * fairest thing is the one asked longest ago, and a candidate rotating through a thin pool gets
 * the widest possible spacing. Never-seen sorts first, then oldest; the id breaks ties so two
 * questions asked in the same session still come back in a fixed order.
 */
function leastRecentlySeen(questions: readonly SelectableQuestion[]): SelectableQuestion {
  return [...questions].sort((a, b) => {
    const left = a.lastSeenAt?.getTime() ?? -1;
    const right = b.lastSeenAt?.getTime() ?? -1;
    return left === right ? a.questionId.localeCompare(b.questionId) : left - right;
  })[0] as SelectableQuestion;
}

/** One weighted draw. The list is sorted by id first, so the draw does not depend on query order. */
function weightedChoice(
  questions: readonly SelectableQuestion[],
  random: () => number,
  weight: (question: SelectableQuestion) => number,
): SelectableQuestion {
  const ordered = [...questions].sort((a, b) => a.questionId.localeCompare(b.questionId));
  const total = ordered.reduce((sum, question) => sum + weight(question), 0);
  let ticket = random() * total;
  for (const question of ordered) {
    ticket -= weight(question);
    if (ticket <= 0) return question;
  }
  return ordered[ordered.length - 1] as SelectableQuestion;
}

/**
 * A small deterministic PRNG (mulberry32 over an FNV-1a hash of the seed). Deliberately not
 * `Math.random`: a session that cannot be replayed cannot be explained to the candidate whose
 * report it produced, and a test over a real corpus needs a fixed answer to assert on.
 */
export function seededRandom(seed: string): () => number {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let drawn = state;
    drawn = Math.imul(drawn ^ (drawn >>> 15), drawn | 1);
    drawn ^= drawn + Math.imul(drawn ^ (drawn >>> 7), drawn | 61);
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
}
