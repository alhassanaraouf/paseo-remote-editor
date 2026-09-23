import type { Placement } from "../shared/settings";

// Tiny module-level store shared by contribute() and the settings screen. The
// server is the only source of truth for the persisted placement, but
// contribute() is not a React tree and has no useSettings hook, so callers push
// values in here and react to them through subscribe().
let current: Placement = "composer";
const listeners = new Set<(value: Placement) => void>();

export function getPlacement(): Placement {
  return current;
}

export function setPlacement(value: Placement): void {
  if (current === value) return;
  current = value;
  for (const listener of listeners) listener(value);
}

export function subscribePlacement(listener: (value: Placement) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
