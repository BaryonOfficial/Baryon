import assert from "node:assert/strict";
import test from "node:test";
import { shouldRenderExternalFrame } from "./baryonVisualizerRuntimeState.js";

test("renders duplicate external frames only when controls changed", () => {
  assert.equal(
    shouldRenderExternalFrame({
      externalFrameState: { frameSequence: 10 },
      shouldAdvance: false,
      controlsChanged: false,
    }),
    false,
  );
  assert.equal(
    shouldRenderExternalFrame({
      externalFrameState: { frameSequence: 10 },
      shouldAdvance: false,
      controlsChanged: true,
    }),
    true,
  );
});
