import type { ConsentType } from "@readi/shared-types";
import { CONSENT_VERSIONS } from "@readi/shared-types/constants";
import { type MessageKey, t } from "@/i18n";

/**
 * The message key for the CURRENT version of each consent text, **per type**.
 *
 * A mapped type rather than `consent.types.${ConsentType}.v${number}`: inside a mapped type `T` is one
 * type at a time, so `CONSENT_VERSIONS[T]` is that type's own version and the union holds exactly the
 * keys that must exist — `audio_processing.v2` and `marketing.v1`, not every type at every version.
 * Written the loose way it produced a union containing `recording_storage.v2`, which no copy answers,
 * and the whole check then failed for a version nobody had bumped.
 */
type CurrentKey<Part extends "title" | "body"> = {
  [T in ConsentType]: `consent.types.${T}.v${(typeof CONSENT_VERSIONS)[T]}.${Part}`;
}[ConsentType];

/**
 * **This is the check the runtime cast below leans on**, and it is the point of the whole file:
 * bumping a version in @readi/shared-types without adding its copy to `en.json` fails type-checking
 * here rather than throwing in front of a candidate on the consent screen.
 */
type MustExist<Key extends MessageKey> = Key;
type _Titles = MustExist<CurrentKey<"title">>;
type _Bodies = MustExist<CurrentKey<"body">>;

/** The copy for the current version of a consent text. */
export function consentCopy(type: ConsentType): { title: string; body: string } {
  const version = CONSENT_VERSIONS[type];
  const base = `consent.types.${type}.v${version}`;
  // Sound because of the two assertions above: the key for every type's current version is a
  // `MessageKey`, and this builds exactly that key from the same constant.
  return {
    title: t(`${base}.title` as CurrentKey<"title">),
    body: t(`${base}.body` as CurrentKey<"body">),
  };
}
