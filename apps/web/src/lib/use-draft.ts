import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * An answer being typed, kept in `sessionStorage` so it survives a reload (ADR-0013).
 *
 * `sessionStorage` rather than `localStorage`: the draft belongs to this tab and this sitting, and a
 * half-written answer should not reappear next week. It is read through `useSyncExternalStore`
 * rather than copied into React state on mount, which means there is **one** source of truth instead
 * of two, no `setState` inside an effect, and nothing for hydration to disagree about — the server
 * snapshot is empty, which is what the server genuinely knows.
 *
 * Storage can be absent or throw (private windows, a locked-down browser). When it does, the draft
 * falls back to memory for the life of the page: losing it on reload is a disappointment, but a
 * textarea that will not accept typing would be a broken screen.
 */
const CHANGED = "readi:draft-changed";

const memory = new Map<string, string>();
let storageWorks = true;

function read(key: string): string {
  if (storageWorks) {
    try {
      return sessionStorage.getItem(key) ?? memory.get(key) ?? "";
    } catch {
      storageWorks = false;
    }
  }
  return memory.get(key) ?? "";
}

function write(key: string, value: string): void {
  // Memory first and always, so the setter cannot fail and freeze the field.
  if (value) memory.set(key, value);
  else memory.delete(key);
  if (!storageWorks) return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    storageWorks = false;
  }
}

/** The draft under `key`, and the setter that stores it. `""` when there is none. */
export function useDraft(key: string): [string, (value: string) => void] {
  const store = useMemo(
    () => ({
      // Arrow properties rather than methods: these are passed as bare functions.
      subscribe: (onChange: () => void) => {
        // Our own event: the `storage` event does not fire in the tab that made the change.
        window.addEventListener(CHANGED, onChange);
        return () => window.removeEventListener(CHANGED, onChange);
      },
      // A string compares by value, so re-reading storage per render is a stable snapshot.
      snapshot: () => read(key),
      server: () => "",
    }),
    [key],
  );

  const value = useSyncExternalStore(store.subscribe, store.snapshot, store.server);
  const set = useCallback(
    (next: string) => {
      write(key, next);
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );
  return [value, set];
}
