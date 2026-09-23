import type { CustomEditor } from "../shared/settings";

// Same rationale as placementStore: contribute() is not a React tree, so the
// settings screen pushes changes here after a successful save and contribute()
// reconciles its Command Center items against the result.
let current: readonly CustomEditor[] = [];
const listeners = new Set<(value: readonly CustomEditor[]) => void>();

export function getCustomEditors(): readonly CustomEditor[] {
  return current;
}

export function setCustomEditors(value: readonly CustomEditor[]): void {
  current = value;
  for (const listener of listeners) listener(value);
}

export function subscribeCustomEditors(listener: (value: readonly CustomEditor[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
