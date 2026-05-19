import { describe, expect, it } from "vitest";
import {
  allowsAudioMotion,
  allowsPresentationResponse,
  allowsSourceForcing,
  isZeroInputHardSilence,
} from "./hardSilenceContract.js";

describe("hard silence contract", () => {
  it("recognizes the canonical zero-input hard-silence authority", () => {
    expect(isZeroInputHardSilence({ liveInputHardSilenceActive: true })).toBe(
      true,
    );
    expect(
      isZeroInputHardSilence({
        debug: { liveInputHardSilenceActive: true },
      }),
    ).toBe(true);
    expect(
      isZeroInputHardSilence({
        liveInputHardSilenceActive: false,
        debug: { liveInputHardSilenceActive: false },
      }),
    ).toBe(false);
  });

  it("blocks source-forced consumers while retained modal state remains visible", () => {
    const hardSilentDecayTail = {
      fieldState: "decay",
      liveInputHardSilenceActive: true,
      modalResponseEnergy: 0.72,
      debug: {
        modalResponseEnergy: 0.84,
      },
    };

    expect(
      allowsSourceForcing(hardSilentDecayTail, { isLiveInputActive: true }),
    ).toBe(false);
    expect(
      allowsAudioMotion(hardSilentDecayTail, { isLiveInputActive: true }),
    ).toBe(false);
    expect(allowsPresentationResponse(hardSilentDecayTail)).toBe(false);
  });

  it("allows audio motion only for an active source driving a non-idle field", () => {
    expect(
      allowsAudioMotion({ fieldState: "active" }, { isPlaying: true }),
    ).toBe(true);
    expect(
      allowsAudioMotion({ fieldState: "active" }, { isLiveInputActive: true }),
    ).toBe(true);
    expect(allowsAudioMotion({ fieldState: "test" }, {})).toBe(true);
    expect(
      allowsAudioMotion({ fieldState: "idle" }, { isLiveInputActive: true }),
    ).toBe(false);
    expect(allowsAudioMotion({ fieldState: "decay" }, {})).toBe(false);
  });
});
