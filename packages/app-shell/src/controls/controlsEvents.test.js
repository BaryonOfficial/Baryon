// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  dispatchControlsChanged,
  dispatchControlsCommand,
  subscribeControlsChanged,
  subscribeControlsCommand,
} from "./controlsEvents.js";

describe("controls event contract", () => {
  it("publishes cloned control snapshots through one change channel", () => {
    const listener = vi.fn();
    const controls = { backgroundColor: "#123456" };
    const unsubscribe = subscribeControlsChanged(listener);

    dispatchControlsChanged(controls);
    controls.backgroundColor = "#ffffff";

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      backgroundColor: "#123456",
    });
    unsubscribe();
    dispatchControlsChanged({ backgroundColor: "#000000" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes bounded control commands and supports cleanup", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeControlsCommand(listener);

    expect(
      dispatchControlsCommand({
        key: "densityGain",
        value: 2,
        persistMode: "none",
      }),
    ).toBe(true);
    expect(listener.mock.calls[0][0].detail).toEqual({
      key: "densityGain",
      value: 2,
      persistMode: "none",
    });
    unsubscribe();
    dispatchControlsCommand({ key: "densityGain", value: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
