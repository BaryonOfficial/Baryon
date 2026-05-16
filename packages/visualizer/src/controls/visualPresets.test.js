import { describe, expect, it } from "vitest";
import {
  BUILT_IN_VISUAL_PRESETS,
  CALIBRATED_CLARITY_VISUAL_PRESET,
  STAGE_CONTAINMENT_VISUAL_PRESET,
} from "./visualPresets.js";

describe("built-in visual presets", () => {
  it("defines the calibrated clarity look as selectable controls", () => {
    expect(CALIBRATED_CLARITY_VISUAL_PRESET).toStrictEqual({
      name: "Calibrated Clarity",
      builtIn: true,
      controls: {
        raymarchSteps: 88,
        zeroPointPrecision: 0.018,
        structureMin: 0.36,
        structureMax: 0.48,
        densityGain: 2.85,
        absorption: 3.05,
        opacityGain: 2.05,
        contourSharpness: 8,
        rimBloomBias: 0.2,
        rimCompression: 1.08,
        holographicIntensity: 0.36,
        holographicShift: 0.35,
        holographicFresnelPower: 5.1,
        bloomEnabled: true,
        bloomStrength: 0.94,
        bloomRadius: 0,
        bloomThreshold: 0.2,
        bloomResponseBias: 0.86,
        colorMode: "spectral",
        spectralMix: 1,
      },
    });
  });

  it("publishes calibrated clarity as the first built-in visual preset", () => {
    expect(BUILT_IN_VISUAL_PRESETS[0]).toBe(CALIBRATED_CLARITY_VISUAL_PRESET);
  });

  it("defines the stage containment look as selectable controls", () => {
    expect(STAGE_CONTAINMENT_VISUAL_PRESET).toStrictEqual({
      name: "Stage Containment",
      builtIn: true,
      controls: {
        raymarchSteps: 88,
        zeroPointPrecision: 0.02,
        structureMin: 0.36,
        structureMax: 0.42,
        densityGain: 2.85,
        absorption: 3.75,
        opacityGain: 2.85,
        contourSharpness: 8,
        rimBloomBias: 0.22,
        rimCompression: 0.9,
        holographicIntensity: 0.46,
        holographicShift: 0.35,
        holographicFresnelPower: 4.2,
        bloomEnabled: true,
        bloomStrength: 0.82,
        bloomRadius: 0,
        bloomThreshold: 0.42,
        bloomResponseBias: 0.72,
        colorMode: "spectral",
        spectralMix: 0.95,
      },
    });
  });

  it("publishes stage containment after calibrated clarity", () => {
    expect(BUILT_IN_VISUAL_PRESETS[1]).toBe(STAGE_CONTAINMENT_VISUAL_PRESET);
  });
});
