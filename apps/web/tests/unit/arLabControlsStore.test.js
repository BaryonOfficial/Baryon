import assert from "node:assert/strict";
import test from "node:test";
import { createArLabControlsStore } from "../../src/ar-lab/arLabControlsStore.js";

test("AR lab controls stay within the canonical non-persistent schema", () => {
  const store = createArLabControlsStore();
  const controls = store.getSnapshot().controlsState;

  assert.equal(controls.outputBackgroundColor, "#000000");
  assert.equal(Object.hasOwn(controls, "outputMode"), false);

  store.dispose();
});
