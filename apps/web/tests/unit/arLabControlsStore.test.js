import assert from "node:assert/strict";
import test from "node:test";
import { createArLabControlsStore } from "../../src/ar-lab/arLabControlsStore.js";

test("AR lab starts from a transparent non-persistent output baseline", () => {
  const store = createArLabControlsStore();
  const controls = store.getSnapshot().controlsState;

  assert.equal(controls.outputMode, "transparent");
  assert.equal(controls.outputBackgroundColor, "#000000");

  store.dispose();
});
