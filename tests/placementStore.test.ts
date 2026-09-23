import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setPlacement, subscribePlacement, getPlacement } from "../client/placementStore";
import type { Placement } from "../shared/settings";

// The store is a module-level singleton; reset to the documented default
// before each test so a stray subscriber cannot leak state across files.
beforeEach(() => {
  setPlacement("composer");
});

describe("placementStore", () => {
  it("notifies subscribers when the value changes", () => {
    const received: Placement[] = [];
    const unsubscribe = subscribePlacement((value) => received.push(value));
    setPlacement("header");
    setPlacement("both");
    unsubscribe();
    assert.deepEqual(received, ["header", "both"]);
  });

  it("does not notify subscribers when the value is unchanged", () => {
    const calls: Placement[] = [];
    const unsubscribe = subscribePlacement((value) => calls.push(value));
    setPlacement("composer");
    setPlacement("composer");
    setPlacement("composer");
    unsubscribe();
    assert.deepEqual(calls, []);
  });

  it("stops notifying after unsubscribe", () => {
    const calls: Placement[] = [];
    const unsubscribe = subscribePlacement((value) => calls.push(value));
    setPlacement("header");
    unsubscribe();
    setPlacement("both");
    assert.deepEqual(calls, ["header"]);
  });

  it("keeps the most recent value readable via getPlacement", () => {
    assert.equal(getPlacement(), "composer");
    setPlacement("both");
    assert.equal(getPlacement(), "both");
    setPlacement("header");
    assert.equal(getPlacement(), "header");
  });
});
