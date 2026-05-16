import { expect, test } from "vitest";
import {
  RENDER_COMMAND_TYPES,
  createRenderCommandQueue,
} from "./renderCommandQueue.js";

test("render command queue coalesces control changes to the latest snapshot", () => {
  const queue = createRenderCommandQueue();
  const firstControls = { backgroundColor: "#000000" };
  const latestControls = { backgroundColor: "#112233" };

  queue.enqueueControlsChanged(firstControls, {
    clearPausedFrameCache: true,
    source: "first",
  });
  queue.enqueueControlsChanged(latestControls, {
    source: "latest",
  });
  latestControls.backgroundColor = "#ffffff";

  const command = queue.drainControlsChanged();

  expect(command).toEqual({
    type: RENDER_COMMAND_TYPES.controlsChanged,
    controls: { backgroundColor: "#112233" },
    clearPausedFrameCache: true,
    source: "latest",
  });
  expect(queue.drainControlsChanged()).toBeNull();
});

test("render command queue can clear pending commands without applying them", () => {
  const queue = createRenderCommandQueue();

  queue.enqueueControlsChanged({ backgroundColor: "#112233" });
  queue.clear();

  expect(queue.drainControlsChanged()).toBeNull();
});
