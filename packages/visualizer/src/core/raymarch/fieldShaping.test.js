import { describe, expect, it } from "vitest";
import {
  BASS_STRUCTURE_FLOOR_MAX,
  BEAM_POWER_BASE,
  BOUNDARY_CONTOUR_ACCENT_WEIGHT,
  BODY_DENSITY_MIX,
  BODY_DENSITY_GAIN,
  CONTOUR_BLEND,
  EMISSION_ROLLOFF_MIX,
  EXCITATION_VISIBILITY_COHERENCE_WEIGHT,
  EXCITATION_VISIBILITY_HARMONICITY_WEIGHT,
  EXCITATION_VISIBILITY_MAX_FLOOR,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HOT_CORE_END,
  HOT_CORE_START,
  LATCHED_FOG_BEAM_REDUCTION,
  LATCHED_FOG_BODY_REDUCTION,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  deriveBeamMask,
  deriveBodyDensity,
  deriveContourShape,
  deriveEmissionRolloff,
  deriveExcitationVisibility,
  deriveLatchedFogMask,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
  deriveHotCoreMix,
  deriveShellWeight,
  deriveStableContourAccent,
  deriveVisibleStructure,
  deriveVisibleDensity,
} from "./fieldShaping.js";

describe("field shaping", () => {
  it("uses a flatter shell-weight range than the prior shell-heavy look", () => {
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeCloseTo(0.16);
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeLessThan(0.36);
  });

  it("keeps shell weighting restrained near the artifact-prone boundary", () => {
    const shell = deriveShellWeight({
      radialDistance: 0.94,
      rimBloomBias: 0.5,
      bandEnergies: [0.4, 0.3, 0.2, 0.4],
    });

    expect(shell.outerShellAccent).toBeGreaterThan(0.9);
    expect(shell.shellWeight).toBeLessThan(0.82);
  });

  it("adds non-zero interior body density away from the boundary", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.8,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    });

    expect(BODY_DENSITY_GAIN).toBeCloseTo(0.12);
    expect(body.interiorMask).toBeGreaterThan(0);
    expect(body.bodyDensity).toBeGreaterThan(0);
  });

  it("applies the latched-fog mask only to high-structure low-change states", () => {
    const fogged = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const active = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const weak = deriveLatchedFogMask({
      structureSignal: 0.35,
      changeSignal: 0.01,
    });

    expect(fogged).toBeGreaterThan(0);
    expect(active).toBe(0);
    expect(weak).toBe(0);
  });

  it("keeps a bounded visibility floor for weak but coherent excitation", () => {
    const weakCoherent = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.72,
      harmonicity: 0.6,
    });
    const noisyWeak = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.08,
      harmonicity: 0.05,
    });

    expect(EXCITATION_VISIBILITY_COHERENCE_WEIGHT).toBeCloseTo(0.42);
    expect(EXCITATION_VISIBILITY_HARMONICITY_WEIGHT).toBeCloseTo(0.16);
    expect(EXCITATION_VISIBILITY_MAX_FLOOR).toBeCloseTo(0.52);
    expect(weakCoherent).toBeGreaterThan(0.38);
    expect(weakCoherent).toBeLessThan(0.53);
    expect(noisyWeak).toBeCloseTo(0.04);
  });

  it("does not create body density when sparse bass structure is absent", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.28,
      threshold: 0.15,
      structure: 0,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    });

    expect(body.bodyDensity).toBe(0);
  });

  it("documents the CPU parity formula for latched-fog body reduction", () => {
    const baseline = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.8,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const fogged = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.8,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(LATCHED_FOG_BODY_REDUCTION).toBeCloseTo(0.18);
    expect(fogged.latchedFogMask).toBeGreaterThan(0);
    expect(fogged.bodyDensity).toBeLessThan(baseline.bodyDensity);
  });

  it("adds a bounded bass visibility floor without replacing real structure", () => {
    const lowOrder = deriveVisibleStructure({
      structure: 0.03,
      nodeBand: 0.92,
      bassSalience: 0.7,
      bandEnergies: [0.7, 0.3, 0.05, 0.02],
      radialDistance: 0.38,
    });
    const brightTreble = deriveVisibleStructure({
      structure: 0.34,
      nodeBand: 0.4,
      bassSalience: 0.05,
      bandEnergies: [0.05, 0.08, 0.35, 0.45],
      radialDistance: 0.82,
    });

    expect(lowOrder.bassStructureFloor).toBeGreaterThan(0.03);
    expect(lowOrder.bassStructureFloor).toBeLessThanOrEqual(
      BASS_STRUCTURE_FLOOR_MAX,
    );
    expect(lowOrder.visibleStructure).toBeGreaterThan(0.03);
    expect(brightTreble.visibleStructure).toBeCloseTo(0.34);
  });

  it("keeps contour shaping dominant while cutting the old fog-heavy fill", () => {
    const contour = deriveContourShape({
      fieldAbs: 0.02,
      threshold: 0.15,
      contourSharpness: 4,
      transientEnergy: 0.5,
    });
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.7,
      edgeFade: 0.92,
      activeMask: 1,
      radialDistance: 0.42,
      boundaryMask: 0.04,
    });
    const shell = deriveShellWeight({
      radialDistance: 0.42,
      rimBloomBias: 0.5,
      bandEnergies: [0.4, 0.3, 0.2, 0.1],
    });
    const beam = deriveBeamMask({
      contourShape: contour.contourShape,
      shellWeight: shell.shellWeight,
      structure: 0.7,
      transientEnergy: 0.5,
      spectralFlux: 0.35,
      radialDistance: 0.42,
      rimCompression: 0.2,
      boundaryMask: 0.04,
    });

    expect(CONTOUR_BLEND).toBeCloseTo(0.82);
    expect(BEAM_POWER_BASE).toBeCloseTo(1.55);
    expect(BODY_DENSITY_MIX).toBeCloseTo(0.5);
    expect(contour.contourShape).toBeGreaterThan(contour.contourCore);
    expect(beam.beamMask).toBeGreaterThan(body.bodyDensity);
    expect(body.bodyDensity / beam.beamMask).toBeLessThan(0.16);
  });

  it("compresses the rim contribution before the beam reaches bloom", () => {
    const uncompressed = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.55,
      spectralFlux: 0.4,
      radialDistance: 0.91,
      rimCompression: 0,
      boundaryMask: 0.92,
    });
    const compressed = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.55,
      spectralFlux: 0.4,
      radialDistance: 0.91,
      rimCompression: 0.72,
      boundaryMask: 0.92,
    });

    expect(compressed.rimCompressionMix).toBeGreaterThan(0);
    expect(compressed.compressedShellWeight).toBeLessThan(
      uncompressed.compressedShellWeight,
    );
    expect(compressed.beamMask).toBeLessThan(uncompressed.beamMask);
  });

  it("documents the CPU parity formula for latched-fog beam reduction", () => {
    const baseline = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.2,
      spectralFlux: 0.08,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const fogged = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.2,
      spectralFlux: 0.08,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(LATCHED_FOG_BEAM_REDUCTION).toBeCloseTo(0.12);
    expect(fogged.latchedFogMask).toBeGreaterThan(0);
    expect(fogged.beamMask).toBeLessThan(baseline.beamMask);
  });

  it("applies a soft emission rolloff before beam peaks blow out", () => {
    const subtle = deriveEmissionRolloff({
      beamDensity: 0.28,
      transientEnergy: 0.12,
    });
    const intense = deriveEmissionRolloff({
      beamDensity: 1.6,
      transientEnergy: 0.74,
    });

    expect(EMISSION_ROLLOFF_MIX).toBeCloseTo(0.68);
    expect(intense.softCappedBeamDensity).toBeLessThan(1.6);
    expect(intense.rolledBeamDensity).toBeLessThan(1.6);
    expect(intense.rolledBeamDensity).toBeGreaterThan(subtle.rolledBeamDensity);
    expect(intense.rolledBeamDensity / 1.6).toBeLessThan(
      subtle.rolledBeamDensity / 0.28,
    );
  });

  it("suppresses weak visible density while preserving strong contours", () => {
    const weak = deriveVisibleDensity({ density: 0.17 });
    const strong = deriveVisibleDensity({ density: 0.42 });

    expect(weak.visibilityGate).toBeLessThan(0.02);
    expect(weak.visibleDensity).toBeLessThan(0.005);
    expect(strong.visibilityGate).toBe(1);
    expect(strong.visibleDensity).toBeCloseTo(0.42);
  });

  it("relaxes low-density visibility for modal cavity energy without adding density", () => {
    const baseline = deriveVisibleDensity({ density: 0.17 });
    const modal = deriveVisibleDensity({
      density: 0.17,
      modalVisibilityEnergy: 0.72,
      modalStructureAnchor: 0.88,
    });
    const noStructure = deriveVisibleDensity({
      density: 0.17,
      modalVisibilityEnergy: 0.72,
      modalStructureAnchor: 0,
    });

    expect(modal.visibilityGate).toBeGreaterThan(baseline.visibilityGate);
    expect(modal.visibleDensity).toBeGreaterThan(0.08);
    expect(modal.physicalVisibleDensity).toBe(baseline.visibleDensity);
    expect(modal.visibleDensity).toBeLessThanOrEqual(0.17);
    expect(noStructure.visibleDensity).toBe(baseline.visibleDensity);
  });

  it("adds only structure-anchored density for near-empty modal cavity energy", () => {
    const modal = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.62,
      modalStructureAnchor: 0.84,
    });
    const noStructure = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.62,
      modalStructureAnchor: 0,
    });

    expect(modal.physicalVisibleDensity).toBe(0);
    expect(modal.modalVisibleDensity).toBeGreaterThan(0.05);
    expect(modal.visibleDensity).toBeGreaterThan(0.05);
    expect(noStructure.modalVisibleDensity).toBe(0);
    expect(noStructure.visibleDensity).toBe(0);
  });

  it("maps moderate sustained modal energy to inspectable local density", () => {
    const modal = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.36,
      modalStructureAnchor: 0.84,
    });
    const noStructure = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.36,
      modalStructureAnchor: 0,
    });

    expect(modal.physicalVisibleDensity).toBe(0);
    expect(modal.visibleDensity).toBeGreaterThan(0.065);
    expect(noStructure.visibleDensity).toBe(0);
  });

  it("pushes hot-core highlights from beam energy instead of body fog", () => {
    const subtleCore = deriveHotCoreMix({
      beamMask: 0.38,
      highlightMask: 0.18,
      contourMix: 0.44,
      transientEnergy: 0.12,
    });
    const hotCore = deriveHotCoreMix({
      beamMask: 0.92,
      highlightMask: 0.78,
      contourMix: 0.86,
      transientEnergy: 0.74,
    });

    expect(HOT_CORE_START).toBeCloseTo(0.56);
    expect(HOT_CORE_END).toBeCloseTo(0.94);
    expect(hotCore).toBeGreaterThan(subtleCore);
    expect(hotCore).toBeGreaterThan(0.45);
    expect(hotCore).toBeLessThan(0.8);
  });

  it("drives contour accent from boundary and highlight masks without camera terms", () => {
    const accent = deriveStableContourAccent({
      contourMix: 0.55,
      boundaryMask: 0.7,
      highlightMask: 0.35,
    });
    const contourOnly = deriveStableContourAccent({
      contourMix: 0.55,
      boundaryMask: 0,
      highlightMask: 0,
    });

    expect(BOUNDARY_CONTOUR_ACCENT_WEIGHT).toBeCloseTo(0.08);
    expect(HIGHLIGHT_CONTOUR_ACCENT_WEIGHT).toBeCloseTo(0.04);
    expect(accent).toBeCloseTo(0.55 * 0.18 + 0.7 * 0.08 + 0.35 * 0.04);
    expect(accent).toBeGreaterThan(contourOnly);
  });

  it("raises holographic fresnel at grazing view angles", () => {
    const faceOn = deriveHolographicFresnel({
      normalViewDot: 0.92,
      holographicIntensity: 0.45,
      holographicFresnelPower: 3.2,
    });
    const grazing = deriveHolographicFresnel({
      normalViewDot: 0.18,
      holographicIntensity: 0.45,
      holographicFresnelPower: 3.2,
    });

    expect(grazing.fresnelBase).toBeGreaterThan(faceOn.fresnelBase);
    expect(grazing.holographicFresnel).toBeGreaterThan(
      faceOn.holographicFresnel,
    );
  });

  it("tightens holographic falloff as fresnel power increases", () => {
    const loose = deriveHolographicFresnel({
      normalViewDot: 0.55,
      holographicIntensity: 0.45,
      holographicFresnelPower: 2.2,
    });
    const tight = deriveHolographicFresnel({
      normalViewDot: 0.55,
      holographicIntensity: 0.45,
      holographicFresnelPower: 5.2,
    });

    expect(tight.fresnelBase).toBeLessThan(loose.fresnelBase);
    expect(tight.holographicFresnel).toBeLessThan(loose.holographicFresnel);
  });

  it("disables holographic sheen when intensity is zero", () => {
    const sheen = deriveHolographicFresnel({
      normalViewDot: 0.2,
      holographicIntensity: 0,
      holographicFresnelPower: 3.2,
    });

    expect(sheen.fresnelBase).toBeGreaterThan(0);
    expect(sheen.holographicFresnel).toBe(0);
  });

  it("preserves the base palette while shifting toward a cool holographic tint", () => {
    const result = deriveHolographicColorMix({
      baseColor: [0.18, 0.36, 0.62],
      surfaceColor: [0.4, 0.72, 0.92],
      holographicShift: 0.35,
      holographicFresnel: 0.42,
    });

    expect(result.colorMix).toBeGreaterThan(0);
    expect(result.colorMix).toBeLessThan(1);
    expect(result.holographicColor[0]).toBeGreaterThan(0.18);
    expect(result.holographicColor[2]).toBeGreaterThan(0.62);
    expect(result.holographicColor).not.toEqual(result.accentColor);
  });
});
