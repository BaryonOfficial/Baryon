import { describe, expect, it } from "vitest";
import { BUILT_IN_VISUAL_PRESETS } from "./visualPresets.js";

describe("built-in visual presets", () => {
  it("publishes baryon-4 as the optical measurement acceptance preset", () => {
    const preset = BUILT_IN_VISUAL_PRESETS.find(
      (entry) => entry.name === "baryon-4",
    );

    expect(preset).toBeTruthy();
    expect(preset?.builtIn).toBe(true);
    expect(preset?.controls).toMatchObject({
      colorMode: "spectral",
      bloomEnabled: true,
    });
    expect(preset?.controls.zeroPointPrecision).toBeLessThanOrEqual(0.02);
    expect(preset?.controls.raymarchSteps).toBeGreaterThanOrEqual(96);
  });

  it("publishes the selectable built-in visual presets in order", () => {
    expect(BUILT_IN_VISUAL_PRESETS).toStrictEqual([
      {
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
      },
      {
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
      },
      {
        name: "baryon-4",
        builtIn: true,
        controls: {
          raymarchSteps: 104,
          zeroPointPrecision: 0.018,
          structureMin: 0.38,
          structureMax: 0.46,
          densityGain: 3.08,
          absorption: 3.62,
          opacityGain: 2.7,
          contourSharpness: 8,
          rimBloomBias: 0.26,
          rimCompression: 1.02,
          holographicIntensity: 0.52,
          holographicShift: 0.42,
          holographicFresnelPower: 4.8,
          bloomEnabled: true,
          bloomStrength: 0.76,
          bloomRadius: 0,
          bloomThreshold: 0.46,
          bloomResponseBias: 0.82,
          colorMode: "spectral",
          spectralMix: 0.92,
        },
      },
    ]);
  });
});
