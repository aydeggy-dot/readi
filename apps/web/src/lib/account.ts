import { ACCOUNT_DELETION } from "@readi/shared-types/constants";

/**
 * Whether what the user typed confirms deletion. Surrounding spaces are forgiven (mobile keyboards
 * add them); the word itself must match exactly, including its capitals. The API checks the same
 * thing — this is the client half of a deliberately awkward gate on an irreversible action.
 */
export function confirmsDeletion(typed: string): boolean {
  return typed.trim() === ACCOUNT_DELETION.confirmation;
}
