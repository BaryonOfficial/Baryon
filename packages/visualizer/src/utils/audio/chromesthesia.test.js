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
      harmonicConfidence: 0.8,
    });
    const highA = createChromesthesiaColor({
      frequency: 440,
      strength: 0.8,
      harmonicConfidence: 0.8,
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
      harmonicConfidence: 0.6,
    });
    const middle = createChromesthesiaColor({
      frequency: 261.626,
      strength: 0.6,
      harmonicConfidence: 0.6,
    });
    const high = createChromesthesiaColor({
      frequency: 2093.005,
      strength: 0.6,
      harmonicConfidence: 0.6,
    });

    expect(low.value).toBeLessThan(middle.value);
    expect(high.value).toBeGreaterThanOrEqual(middle.value);
    expect(high.value).toBeLessThanOrEqual(0.95);
  });

  it("uses strength and stability to raise saturation and weight", () => {
    const weak = createChromesthesiaColor({
      frequency: 440,
      strength: 0.15,
      harmonicConfidence: 0.2,
    });
    const strong = createChromesthesiaColor({
      frequency: 440,
      strength: 0.85,
      harmonicConfidence: 0.9,
      spectralCentroid: 0.5,
    });

    expect(strong.saturation).toBeGreaterThan(weak.saturation);
    expect(strong.weight).toBeGreaterThan(weak.weight);
  });

  it("keeps strong low notes visibly saturated instead of dim gray", () => {
    const lowA = createChromesthesiaColor({
      frequency: 110,
      strength: 0.9,
      harmonicConfidence: 0.9,
      spectralCentroid: 0.18,
    });

    expect(lowA.noteName).toBe("A");
    expect(lowA.saturation).toBeGreaterThanOrEqual(0.82);
    expect(lowA.value).toBeGreaterThanOrEqual(0.58);
  });

  it("uses transients and bright spectral energy as short-lived color intensity", () => {
    const sustained = createChromesthesiaColor({
      frequency: 660,
      strength: 0.55,
      harmonicConfidence: 0.65,
      spectralCentroid: 0.22,
      accentEnergy: 0.05,
      trebleBroadbandEnergy: 0.05,
    });
    const accented = createChromesthesiaColor({
      frequency: 660,
      strength: 0.55,
      harmonicConfidence: 0.65,
      spectralCentroid: 0.78,
      accentEnergy: 0.8,
      trebleBroadbandEnergy: 0.55,
    });

    expect(accented.saturation).toBeGreaterThan(sustained.saturation);
    expect(accented.value).toBeGreaterThan(sustained.value);
    expect(accented.weight).toBeGreaterThan(sustained.weight);
  });

  it("keeps key-relative tint bounded around the absolute pitch family", () => {
    const base = createChromesthesiaColor({
      frequency: 261.626,
      strength: 0.82,
      harmonicConfidence: 0.86,
      keyTonic: 0,
      keyMode: "major",
      keyConfidence: 1,
    });
    const inG = createChromesthesiaColor({
      frequency: 261.626,
      strength: 0.82,
      harmonicConfidence: 0.86,
      keyTonic: 7,
      keyMode: "major",
      keyConfidence: 1,
    });

    expect(base.noteName).toBe("C");
    expect(inG.noteName).toBe("C");
    expect(Math.abs(inG.hue - pitchClassToHue(0))).toBeLessThanOrEqual(0.035);
    expect(Math.abs(inG.hue - base.hue)).toBeGreaterThan(0);
  });

  it("does not apply key tint below the confidence gate", () => {
    const unkeyed = createChromesthesiaColor({
      frequency: 329.628,
      strength: 0.75,
      harmonicConfidence: 0.8,
      keyTonic: 0,
      keyMode: "minor",
      keyConfidence: 0.34,
    });

    expect(unkeyed.noteName).toBe("E");
    expect(unkeyed.hue).toBeCloseTo(pitchClassToHue(4));
  });

  it("uses mode-aware key tint without replacing absolute pitch identity", () => {
    const majorThirdInC = createChromesthesiaColor({
      frequency: 329.628,
      strength: 0.8,
      harmonicConfidence: 0.8,
      keyTonic: 0,
      keyMode: "major",
      keyConfidence: 1,
    });
    const minorThirdInC = createChromesthesiaColor({
      frequency: 311.127,
      strength: 0.8,
      harmonicConfidence: 0.8,
      keyTonic: 0,
      keyMode: "minor",
      keyConfidence: 1,
    });

    expect(majorThirdInC.noteName).toBe("E");
    expect(minorThirdInC.noteName).toBe("D#");
    expect(
      Math.abs(majorThirdInC.hue - pitchClassToHue(4)),
    ).toBeLessThanOrEqual(0.035);
    expect(
      Math.abs(minorThirdInC.hue - pitchClassToHue(3)),
    ).toBeLessThanOrEqual(0.035);
    expect(majorThirdInC.hue).toBeGreaterThan(pitchClassToHue(4));
    expect(minorThirdInC.hue).toBeGreaterThan(pitchClassToHue(3));
  });

  it("lets accents boost intensity without changing harmonic confidence", () => {
    const sustained = createChromesthesiaColor({
      frequency: 440,
      strength: 0.6,
      harmonicConfidence: 0.42,
      accentEnergy: 0,
    });
    const accented = createChromesthesiaColor({
      frequency: 440,
      strength: 0.6,
      harmonicConfidence: 0.42,
      accentEnergy: 1,
    });

    expect(accented.harmonicConfidence).toBeCloseTo(
      sustained.harmonicConfidence,
    );
    expect(accented.saturation).toBeGreaterThan(sustained.saturation);
    expect(accented.value).toBeGreaterThan(sustained.value);
    expect(accented.weight).toBeGreaterThan(sustained.weight);
  });
});
