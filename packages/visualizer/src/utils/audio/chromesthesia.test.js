import { describe, expect, it } from "vitest";
import {
  createChromesthesiaColor,
  getNoteNameForFrequency,
  pitchClassToHue,
} from "./chromesthesia.js";

describe("chromesthesia mapping", () => {
  it("maps the same note class to the same hue across octaves", () => {
    const lowA = createChromesthesiaColor({
      frequency: 110,
      strength: 0.8,
      stability: 0.8,
    });
    const highA = createChromesthesiaColor({
      frequency: 440,
      strength: 0.8,
      stability: 0.8,
    });

    expect(getNoteNameForFrequency(110)).toBe("A");
    expect(getNoteNameForFrequency(440)).toBe("A");
    expect(lowA.hue).toBeCloseTo(highA.hue);
    expect(lowA.hue).toBeCloseTo(pitchClassToHue(9));
  });

  it("clamps octave brightness across the supported range", () => {
    const low = createChromesthesiaColor({
      frequency: 65.406,
      strength: 0.6,
      stability: 0.6,
    });
    const middle = createChromesthesiaColor({
      frequency: 261.626,
      strength: 0.6,
      stability: 0.6,
    });
    const high = createChromesthesiaColor({
      frequency: 2093.005,
      strength: 0.6,
      stability: 0.6,
    });

    expect(low.value).toBeLessThan(middle.value);
    expect(high.value).toBeGreaterThanOrEqual(middle.value);
    expect(high.value).toBeLessThanOrEqual(0.95);
  });

  it("uses strength and stability to raise saturation and weight", () => {
    const weak = createChromesthesiaColor({
      frequency: 440,
      strength: 0.15,
      stability: 0.2,
    });
    const strong = createChromesthesiaColor({
      frequency: 440,
      strength: 0.85,
      stability: 0.9,
      spectralCentroid: 0.5,
    });

    expect(strong.saturation).toBeGreaterThan(weak.saturation);
    expect(strong.weight).toBeGreaterThan(weak.weight);
  });
});
