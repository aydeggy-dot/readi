import { CONSENT_VERSIONS, type ConsentType } from "@readi/shared-types";

/**
 * What "granted" means, in one place.
 *
 * `consent_records` is append-only, so a type's answer is its **latest** row, and that row counts as
 * consent only if it granted the **current** version of the text: a wording change makes an old yes
 * a yes to a question the user never saw (`CONSENT_VERSIONS`). Three readers need exactly this rule
 * and would each get it subtly wrong — `list()` renders it as a tick, `allDecided()` gates
 * onboarding on it, and from M4 the calibration sampler asks it before showing a person somebody
 * else's words (ADR-0017). A sampler that got it wrong would not fail; it would quietly sample a
 * candidate who said no, which is the whole reason this is a named function with a truth table
 * rather than two inline comparisons.
 */
export interface LatestConsent {
  granted: boolean;
  version: number;
}

export function isCurrentGrant(type: ConsentType, latest: LatestConsent | undefined): boolean {
  if (latest === undefined) return false;
  return latest.granted && latest.version === CONSENT_VERSIONS[type];
}
