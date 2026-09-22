/**
 * The answer-key detector, shared by the two specs that use it: `content-no-answer-key.int.spec.ts`
 * against planted sentinels, and `content-seed.int.spec.ts` against the corpus we actually ship.
 *
 * It looks for two things — text that must not appear, and field names that must not exist at any
 * depth. `level` on its own is the candidate's experience level and is theirs to see; `levels` is
 * a rubric's descriptors, which is not.
 */

const ANSWER_KEY_FIELD = /rubric|criteri|ideal_point|levels|weight/i;

/** Every complaint about one payload: answer-key text found, and answer-key-shaped keys found. */
export function answerKeyLeaks(payload: unknown, markers: readonly string[]): string[] {
  const leaks: string[] = [];
  const raw = JSON.stringify(payload) ?? "";
  for (const marker of markers) {
    if (raw.includes(marker)) leaks.push(`answer-key text ${marker}`);
  }
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key;
      if (ANSWER_KEY_FIELD.test(key)) leaks.push(`answer-key field ${here}`);
      walk(item, here);
    }
  };
  walk(payload, "");
  return leaks;
}
