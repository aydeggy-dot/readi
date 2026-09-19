import type { ConsentType } from "@readi/shared-types";
import { CONSENT_VERSIONS } from "@readi/shared-types/constants";
import { t } from "@/i18n";

/**
 * The copy for the CURRENT version of a consent text. The message key includes the version, so
 * bumping a version in @readi/shared-types without adding its copy fails type-checking.
 */
export function consentCopy(type: ConsentType): { title: string; body: string } {
  const version = CONSENT_VERSIONS[type];
  return {
    title: t(`consent.types.${type}.v${version}.title`),
    body: t(`consent.types.${type}.v${version}.body`),
  };
}
