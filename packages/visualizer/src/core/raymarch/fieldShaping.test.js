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
  EXCITATION_VISIBILITY_MAX_FLOOR,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HOT_CORE_END,
  HOT_CORE_START,
  HOT_CORE_CROWDING_THRESHOLD_LIFT,
  HOT_CORE_SURFACE_CROWDING_REDUCTION,
  LATCHED_FOG_BEAM_REDUCTION,
  LATCHED_FOG_BODY_REDUCTION,
  MODAL_CROWDING_BODY_COMPRESSION,
  RETAINED_HIGH_Q_RIDGE_CONTOUR_ACCENT,
  RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR,
  RETAINED_HIGH_Q_RIDGE_DENSITY_LIFT,
  STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION,
  STRUCTURE_AWARE_EMISSION_MIN_GAIN,
  WHITE_EMISSION_CROWDING_REDUCTION,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  SIGNED_PHASE_OVERLAY_GRADIENT_GAIN,
  deriveBeamMask,
  deriveBodyDensity,
  deriveContourGainBase,
  deriveContourShape,
  deriveEmissionRolloff,
  deriveExcitationVisibility,
  deriveLatchedFogMask,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
  deriveCrowdedHighlightMix,
  deriveHotCoreCrowding,
  deriveHotCoreMix,
  deriveModalCrowdingDensity,
  deriveRetainedHighQVisibilityDiagnostics,
  deriveShellWeight,
  deriveStableContourAccent,
  deriveSignedPhaseOverlayField,
  deriveStructureAwareEmissionGain,
  deriveSpectralColorBiasOffset,
  deriveVisibleStructure,
  deriveVisibleDensity,
} from "./fieldShaping.js";

function mixTestColor(left, right, t) {
  return left.map((channel, index) => channel * (1 - t) + right[index] * t);
}

function saturationOf(color) {
  const max = Math.max(...color);
  if (max <= 1e-6) return 0;
  const min = Math.min(...color);
  return (max - min) / max;
}

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

  it("releases the latched-fog mask when current transients are active", () => {
    const latched = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const reactive = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
      transientEnergy: 0.56,
    });

    expect(latched).toBeGreaterThan(0.6);
    expect(reactive).toBeLessThan(latched * 0.2);
  });

  it("keeps a bounded visibility floor for weak but coherent excitation", () => {
    const weakCoherent = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.72,
      modalVisibilityEnergy: 0.36,
    });
    const noisyWeak = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.08,
    });

    expect(EXCITATION_VISIBILITY_COHERENCE_WEIGHT).toBeCloseTo(0.42);
    expect(EXCITATION_VISIBILITY_MAX_FLOOR).toBeCloseTo(0.52);
    expect(weakCoherent).toBeGreaterThan(0.38);
    expect(weakCoherent).toBeLessThan(0.53);
    expect(noisyWeak).toBeCloseTo(0.04);
  });

  it("prevents the excitation floor from overriding absent current source authority", () => {
    const staleCoherent = deriveExcitationVisibility({
      excitationGate: 0.02,
      modeCoherence: 0.72,
      modalVisibilityEnergy: 0,
      sourceAuthority: 0,
    });
    const currentCoherent = deriveExcitationVisibility({
      excitationGate: 0.02,
      modeCoherence: 0.72,
      modalVisibilityEnergy: 0.36,
      sourceAuthority: 1,
    });

    expect(staleCoherent).toBeCloseTo(0.02);
    expect(currentCoherent).toBeGreaterThan(0.38);
  });

  it("lets current modal visibility carry low-meter resonant source authority", () => {
    const bowlTail = deriveExcitationVisibility({
      excitationGate: 0.02,
      modeCoherence: 0.5,
      modalVisibilityEnergy: 0.18,
      sourceAuthority: 5.2 / 255,
    });
    const weakNoisy = deriveExcitationVisibility({
      excitationGate: 0.02,
      modeCoherence: 0.08,
      modalVisibilityEnergy: 0,
      sourceAuthority: 5.2 / 255,
    });

    expect(bowlTail).toBeGreaterThan(0.08);
    expect(weakNoisy).toBeCloseTo(0.02);
  });

  it("lets retained high-Q observer authority carry steady harmonic tails", () => {
    const steadyHighQ = deriveExcitationVisibility({
      excitationGate: 0,
      modeCoherence: 0.58,
      modalVisibilityEnergy: 0.015,
      modalVisibilityRetainedHighQEnergy: 0.24,
      sourceAuthority: 0.01,
    });
    const weakNoisy = deriveExcitationVisibility({
      excitationGate: 0,
      modeCoherence: 0.08,
      modalVisibilityEnergy: 0,
      modalVisibilityRetainedHighQEnergy: 0,
      sourceAuthority: 0.01,
    });

    expect(steadyHighQ).toBeGreaterThan(0.12);
    expect(steadyHighQ).toBeLessThanOrEqual(EXCITATION_VISIBILITY_MAX_FLOOR);
    expect(weakNoisy).toBe(0);
  });

  it("lets observer-authorized topology carry source authority without global brightness", () => {
    const steadyObserved = deriveExcitationVisibility({
      excitationGate: 0,
      modeCoherence: 0.58,
      modalVisibilityEnergy: 0.01,
      modalObserverVisibilityEnergy: 0.22,
      sourceAuthority: 0.005,
    });
    const staleObserved = deriveExcitationVisibility({
      excitationGate: 0,
      modeCoherence: 0.58,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0,
      sourceAuthority: 0.005,
    });

    expect(steadyObserved).toBeGreaterThan(0.1);
    expect(steadyObserved).toBeLessThanOrEqual(EXCITATION_VISIBILITY_MAX_FLOOR);
    expect(staleObserved).toBe(0);
  });

  it("keeps modal cavity visibility from modal energy", () => {
    const bowlLike = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0.36,
    });
    const noModalEnergy = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0,
    });
    const noisyWeak = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.08,
      modalVisibilityEnergy: 0,
    });

    expect(bowlLike).toBeGreaterThan(0.36);
    expect(bowlLike).toBeGreaterThan(noModalEnergy);
    expect(noisyWeak).toBeCloseTo(0.04);
  });

  it("lifts observer-authorized ridge density only where modal anchors exist", () => {
    const anchored = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0.24,
      modalStructureAnchor: 0.72,
      ridgeAnchor: 0.8,
      ridgeSupportAnchor: 0.7,
    });
    const noAnchor = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0.24,
      modalStructureAnchor: 0,
      ridgeAnchor: 0,
      ridgeSupportAnchor: 0,
    });

    expect(anchored.observerRidgeVisibleDensity).toBeGreaterThan(0);
    expect(anchored.visibleDensity).toBe(anchored.observerRidgeVisibleDensity);
    expect(anchored.physicalVisibleDensity).toBe(0);
    expect(noAnchor.observerRidgeVisibleDensity).toBe(0);
    expect(noAnchor.visibleDensity).toBe(0);
  });

  it("uses phase overlay only as an anchored ridge visibility lift", () => {
    const physical = deriveVisibleDensity({
      density: 0.3,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0,
      modalPhaseOverlayEnergy: 0.7,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.75,
      ridgeSupportAnchor: 0.7,
    });
    const anchored = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0,
      modalPhaseOverlayEnergy: 0.7,
      modalStructureAnchor: 0.7,
      ridgeAnchor: 0.8,
      ridgeSupportAnchor: 0.7,
    });
    const noAnchor = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalObserverVisibilityEnergy: 0,
      modalPhaseOverlayEnergy: 0.62,
      modalStructureAnchor: 0,
      ridgeAnchor: 0,
      ridgeSupportAnchor: 0,
    });

    expect(anchored.phaseRidgeVisibleDensity).toBeGreaterThan(0);
    expect(anchored.phaseRidgeLift).toBeGreaterThan(0);
    expect(anchored.phaseContourAccent).toBeGreaterThan(0);
    expect(anchored.visibleDensity).toBe(anchored.phaseRidgeVisibleDensity);
    expect(anchored.physicalVisibleDensity).toBe(0);
    expect(physical.physicalVisibleDensity).toBeGreaterThan(0);
    expect(noAnchor.phaseRidgeVisibleDensity).toBe(0);
    expect(noAnchor.phaseRidgeLift).toBe(0);
    expect(noAnchor.phaseContourAccent).toBe(0);
    expect(noAnchor.visibleDensity).toBe(0);
  });

  it("applies phase overlay as bounded signed displacement, not positive energy", () => {
    const reinforcing = deriveSignedPhaseOverlayField({
      cachedField: 0.1,
      phaseDisplacement: 0.8,
      phaseAuthority: 1,
      overlayStrength: 1,
    });
    const cancelling = deriveSignedPhaseOverlayField({
      cachedField: 0.1,
      phaseDisplacement: -0.6,
      phaseAuthority: 1,
      overlayStrength: 1,
    });
    const disabled = deriveSignedPhaseOverlayField({
      cachedField: 0.1,
      phaseDisplacement: -0.6,
      phaseAuthority: 0,
      overlayStrength: 1,
    });

    expect(reinforcing.phaseContribution).toBeGreaterThan(0);
    expect(reinforcing.effectiveFieldAbs).toBeGreaterThan(0.1);
    expect(cancelling.phaseContribution).toBeLessThan(0);
    expect(cancelling.effectiveFieldAbs).toBeLessThan(0.1);
    expect(disabled.phaseContribution).toBe(0);
    expect(disabled.effectiveField).toBeCloseTo(0.1);
  });

  it("uses signed phase gradient as bounded structure support", () => {
    const supported = deriveSignedPhaseOverlayField({
      cachedField: 0.1,
      phaseDisplacement: 0,
      phaseGradientMagnitude: 0.8,
      phaseAuthority: 1,
      overlayStrength: 1,
    });

    expect(SIGNED_PHASE_OVERLAY_GRADIENT_GAIN).toBeCloseTo(0.35);
    expect(supported.phaseGradientContribution).toBeCloseTo(0.28);
  });

  it("derives excitation visibility without hint inputs", () => {
    const visibility = deriveExcitationVisibility({
      excitationGate: 0.04,
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0.36,
    });
    expect(visibility).toBeGreaterThan(0.36);
  });

  it("derives contour gain without hint inputs", () => {
    const gain = deriveContourGainBase({
      structureSignal: 0.22,
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0.36,
      beatPhaseDecay: 0.2,
    });
    expect(gain).toBeGreaterThan(0.14);
  });

  it("derives spectral color bias without hint inputs", () => {
    const bias = deriveSpectralColorBiasOffset({
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0.36,
      changeSignal: 0.08,
    });
    expect(bias).toBeGreaterThan(0);
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

  it("lets current transients recover body density from latched fog", () => {
    const latched = deriveBodyDensity({
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
    const reactive = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.8,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.01,
      transientEnergy: 0.56,
    });

    expect(reactive.latchedFogMask).toBeLessThan(latched.latchedFogMask * 0.2);
    expect(reactive.bodyDensity).toBeGreaterThan(latched.bodyDensity);
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

  it("lets current transients recover beam density from latched fog", () => {
    const latched = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.02,
      spectralFlux: 0.01,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const reactive = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      structure: 0.76,
      transientEnergy: 0.56,
      spectralFlux: 0.01,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(reactive.latchedFogMask).toBeLessThan(latched.latchedFogMask * 0.2);
    expect(reactive.beamMask).toBeGreaterThan(latched.beamMask);
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

  it("compresses body-dominant modal crowding before it becomes haze", () => {
    expect(MODAL_CROWDING_BODY_COMPRESSION).toBeCloseTo(0.55);

    const additiveDensity = 0.34 + 1.4 * BODY_DENSITY_MIX;
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.34,
      dampedBodyDensity: 1.4,
    });

    expect(crowded.ridgeConcentration).toBeLessThan(0.25);
    expect(crowded.bodyCompression).toBeLessThan(0.75);
    expect(crowded.adjustedBodyDensity).toBeLessThan(1.4);
    expect(crowded.localDensity).toBeLessThan(additiveDensity * 0.82);
  });

  it("compresses dense mixed accumulation before it becomes a broad haze", () => {
    const additiveDensity = 0.86 + 1.32 * BODY_DENSITY_MIX;
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.86,
      dampedBodyDensity: 1.32,
    });

    expect(crowded.ridgeConcentration).toBeGreaterThan(0.3);
    expect(crowded.ridgeConcentration).toBeLessThan(0.55);
    expect(crowded.localDensity).toBeLessThan(additiveDensity * 0.78);
  });

  it("preserves ridge-dominant density while crowding compression affects body fill", () => {
    const additiveDensity = 1.1 + 0.16 * BODY_DENSITY_MIX;
    const ridge = deriveModalCrowdingDensity({
      rolledBeamDensity: 1.1,
      dampedBodyDensity: 0.16,
    });

    expect(ridge.ridgeConcentration).toBeGreaterThan(0.86);
    expect(ridge.bodyCompression).toBeGreaterThan(0.9);
    expect(ridge.localDensity).toBeGreaterThan(additiveDensity * 0.99);
    expect(ridge.rolledBeamDensity).toBeCloseTo(1.1);
  });

  it("keeps low-threshold emission available to ridges while suppressing broad body fill", () => {
    const bodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.18,
      bodyCrowding: 1.05,
      contourMix: 0.22,
      highlightMask: 0.12,
      transientEnergy: 0.08,
    });
    const filament = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.92,
      bodyCrowding: 1.05,
      contourMix: 0.84,
      highlightMask: 0.42,
      transientEnergy: 0.08,
    });

    expect(STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION).toBeCloseTo(0.72);
    expect(bodyFill.filamentEligibility).toBeLessThan(0.22);
    expect(bodyFill.emissionGain).toBeLessThan(0.72);
    expect(filament.filamentEligibility).toBe(1);
    expect(filament.emissionGain).toBeGreaterThan(0.98);
    expect(filament.emissionGain).toBeGreaterThan(bodyFill.emissionGain + 0.28);
  });

  it("keeps transient relief bounded so dense body emission cannot fully bypass suppression", () => {
    const sustained = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.24,
      bodyCrowding: 1.12,
      contourMix: 0.18,
      highlightMask: 0.08,
      transientEnergy: 0.04,
    });
    const transient = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.24,
      bodyCrowding: 1.12,
      contourMix: 0.18,
      highlightMask: 0.08,
      transientEnergy: 0.92,
    });

    expect(STRUCTURE_AWARE_EMISSION_MIN_GAIN).toBeCloseTo(0.34);
    expect(transient.emissionGain).toBeGreaterThan(sustained.emissionGain);
    expect(transient.emissionGain).toBeLessThan(0.8);
    expect(sustained.bodySuppression).toBeGreaterThan(0.75);
  });

  it("catches moderate body fill before low-threshold bloom treats it like structure", () => {
    const moderateBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.12,
      bodyCrowding: 0.16,
      contourMix: 0.15,
      highlightMask: 0.08,
      transientEnergy: 0.08,
    });

    expect(moderateBodyFill.bodyCrowdingGate).toBeGreaterThan(0.3);
    expect(moderateBodyFill.emissionGain).toBeLessThan(0.9);
    expect(moderateBodyFill.emissionGain).toBeGreaterThan(
      STRUCTURE_AWARE_EMISSION_MIN_GAIN,
    );
  });

  it("does not preserve bright body fill just because it is already highlighted", () => {
    const highlightedBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.12,
      bodyCrowding: 0.16,
      contourMix: 0.85,
      highlightMask: 0.95,
      transientEnergy: 0.25,
    });
    const denseHighlightedBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.18,
      bodyCrowding: 1.05,
      contourMix: 0.75,
      highlightMask: 0.9,
      transientEnergy: 0.25,
    });

    expect(highlightedBodyFill.filamentEligibility).toBeLessThan(0.18);
    expect(highlightedBodyFill.emissionGain).toBeLessThan(0.78);
    expect(denseHighlightedBodyFill.emissionGain).toBeLessThan(0.42);
  });

  it("keeps hot-core authority on beam density rather than crowding compression", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.58,
      dampedBodyDensity: 1.2,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: 0.58,
      highlightMask: 0.12,
      contourMix: 0.66,
      transientEnergy: 0.2,
    });
    const crowdedHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.12,
      contourMix: 0.66,
      transientEnergy: 0.2,
    });

    expect(crowded.adjustedBodyDensity).toBeLessThan(1.2);
    expect(crowdedHotCore).toBeCloseTo(baselineHotCore);
  });

  it("raises the hot-core threshold for locally crowded bright fields", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.82,
      dampedBodyDensity: 1.24,
    });
    const hotCoreCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.12,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.36,
      contourMix: 0.78,
      transientEnergy: 0.12,
    });
    const crowdedHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.36,
      contourMix: 0.78,
      transientEnergy: 0.12,
      hotCoreStart: hotCoreCrowding.hotCoreStart,
    });

    expect(HOT_CORE_CROWDING_THRESHOLD_LIFT).toBeCloseTo(0.14);
    expect(hotCoreCrowding.hotCoreCrowding).toBeGreaterThan(0.35);
    expect(hotCoreCrowding.hotCoreStart).toBeGreaterThan(HOT_CORE_START);
    expect(crowdedHotCore).toBeLessThan(baselineHotCore * 0.82);
  });

  it("keeps isolated ridge hot-core response nearly unchanged", () => {
    const ridge = deriveModalCrowdingDensity({
      rolledBeamDensity: 1.12,
      dampedBodyDensity: 0.12,
    });
    const hotCoreCrowding = deriveHotCoreCrowding({
      ridgeConcentration: ridge.ridgeConcentration,
      bodyCrowding: ridge.bodyCrowding,
      transientEnergy: 0.1,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: ridge.rolledBeamDensity,
      highlightMask: 0.22,
      contourMix: 0.82,
      transientEnergy: 0.1,
    });
    const ridgeHotCore = deriveHotCoreMix({
      beamMask: ridge.rolledBeamDensity,
      highlightMask: 0.22,
      contourMix: 0.82,
      transientEnergy: 0.1,
      hotCoreStart: hotCoreCrowding.hotCoreStart,
    });

    expect(hotCoreCrowding.hotCoreCrowding).toBeLessThan(0.02);
    expect(ridgeHotCore).toBeGreaterThan(baselineHotCore * 0.98);
  });

  it("lets strong transients push through the hot-core crowding limiter", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.82,
      dampedBodyDensity: 1.24,
    });
    const sustainedCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.08,
    });
    const transientCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.86,
    });

    expect(transientCrowding.hotCoreCrowding).toBeLessThan(
      sustainedCrowding.hotCoreCrowding,
    );
    expect(transientCrowding.hotCoreStart).toBeLessThan(
      sustainedCrowding.hotCoreStart,
    );
  });

  it("keeps white emission crowded during dense transients", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.86,
      dampedBodyDensity: 1.32,
    });
    const transientCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.86,
    });
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.52,
      hotCoreCrowding: transientCrowding.hotCoreCrowding,
      whiteEmissionCrowding: transientCrowding.whiteEmissionCrowding,
    });

    expect(transientCrowding.hotCoreCrowding).toBeLessThan(
      transientCrowding.whiteEmissionCrowding,
    );
    expect(highlight.crowdedHotCoreMix).toBeGreaterThan(0.48);
    expect(highlight.crowdedWhiteEmissionMix).toBeLessThan(0.52 * 0.45);
  });

  it("reduces crowded white-emission mix before highlights desaturate", () => {
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.62,
      whiteEmissionMix: 0.52,
      hotCoreCrowding: 0.82,
    });

    expect(WHITE_EMISSION_CROWDING_REDUCTION).toBeCloseTo(0.72);
    expect(highlight.crowdedWhiteEmissionMix).toBeLessThan(0.52 * 0.55);
    expect(highlight.crowdedHotCoreMix).toBeLessThan(0.62);
  });

  it("preserves isolated ridge highlight and white-emission mix", () => {
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.82,
      whiteEmissionMix: 0.3,
      hotCoreCrowding: 0.01,
    });

    expect(HOT_CORE_SURFACE_CROWDING_REDUCTION).toBeCloseTo(0.34);
    expect(highlight.crowdedHotCoreMix).toBeGreaterThan(0.82 * 0.98);
    expect(highlight.crowdedWhiteEmissionMix).toBeGreaterThan(0.3 * 0.98);
  });

  it("applies less highlight desaturation when transient relief lowers crowding", () => {
    const sustained = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.42,
      hotCoreCrowding: 0.76,
    });
    const transient = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.42,
      hotCoreCrowding: 0.34,
    });

    expect(transient.crowdedHotCoreMix).toBeGreaterThan(
      sustained.crowdedHotCoreMix,
    );
    expect(transient.crowdedWhiteEmissionMix).toBeGreaterThan(
      sustained.crowdedWhiteEmissionMix,
    );
  });

  it("preserves more saturation than direct mix-to-white in crowded color", () => {
    const baseColor = [0.92, 0.24, 0.7];
    const white = [1, 1, 1];
    const directMix = mixTestColor(baseColor, white, 0.44);
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.64,
      whiteEmissionMix: 0.44,
      hotCoreCrowding: 0.84,
    });
    const crowdedMix = mixTestColor(
      baseColor,
      white,
      highlight.crowdedWhiteEmissionMix,
    );

    expect(saturationOf(crowdedMix)).toBeGreaterThan(
      saturationOf(directMix) * 1.45,
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

  it("keeps retained high-Q ridge density readable without changing physical density", () => {
    const baseline = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.16,
      modalStructureAnchor: 0.84,
      ridgeAnchor: 0.86,
    });
    const retained = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.16,
      modalVisibilityRetainedHighQEnergy: 0.22,
      modalStructureAnchor: 0.84,
      ridgeAnchor: 0.86,
    });
    const noRidge = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.16,
      modalVisibilityRetainedHighQEnergy: 0.22,
      modalStructureAnchor: 0.84,
      ridgeAnchor: 0,
    });
    const noStructure = deriveVisibleDensity({
      density: 0.004,
      modalVisibilityEnergy: 0.16,
      modalVisibilityRetainedHighQEnergy: 0.22,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.86,
    });

    expect(RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR).toBeCloseTo(0.34);
    expect(RETAINED_HIGH_Q_RIDGE_DENSITY_LIFT).toBeCloseTo(0.22);
    expect(RETAINED_HIGH_Q_RIDGE_CONTOUR_ACCENT).toBeCloseTo(0.11);
    expect(retained.physicalVisibleDensity).toBe(
      baseline.physicalVisibleDensity,
    );
    expect(retained.visibleDensity).toBeGreaterThan(
      baseline.visibleDensity * 1.25,
    );
    expect(retained.retainedHighQRidgeVisibleDensity).toBeGreaterThan(0.03);
    expect(retained.retainedHighQRidgeVisibleDensity).toBeLessThanOrEqual(
      RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR,
    );
    expect(retained.retainedHighQContourAccent).toBeGreaterThan(0.01);
    expect(noRidge.retainedHighQRidgeVisibleDensity).toBe(0);
    expect(noStructure.physicalVisibleDensity).toBe(
      retained.physicalVisibleDensity,
    );
    expect(noStructure.retainedHighQRidgeVisibleDensity).toBeGreaterThan(0);
    expect(noStructure.retainedHighQRidgeVisibleDensity).toBeLessThan(
      retained.retainedHighQRidgeVisibleDensity,
    );
  });

  it("keeps retained high-Q ridges readable when the contour-ridge intersection thins out", () => {
    const baseline = deriveVisibleDensity({
      density: 0.003,
      modalVisibilityEnergy: 0.18,
      modalVisibilityRetainedHighQEnergy: 0.2,
      modalStructureAnchor: 0.82,
      ridgeAnchor: 0.025,
    });
    const supported = deriveVisibleDensity({
      density: 0.003,
      modalVisibilityEnergy: 0.18,
      modalVisibilityRetainedHighQEnergy: 0.2,
      modalStructureAnchor: 0.82,
      ridgeAnchor: 0.025,
      ridgeSupportAnchor: 0.58,
    });
    const noSupport = deriveVisibleDensity({
      density: 0.003,
      modalVisibilityEnergy: 0.18,
      modalVisibilityRetainedHighQEnergy: 0.2,
      modalStructureAnchor: 0.82,
      ridgeAnchor: 0,
      ridgeSupportAnchor: 0,
    });

    expect(supported.physicalVisibleDensity).toBe(
      baseline.physicalVisibleDensity,
    );
    expect(supported.retainedHighQRidgeAnchor).toBeGreaterThan(
      baseline.retainedHighQRidgeAnchor * 8,
    );
    expect(supported.retainedHighQRidgeVisibleDensity).toBeGreaterThan(0.015);
    expect(noSupport.retainedHighQRidgeVisibleDensity).toBe(0);
  });

  it("keeps retained high-Q ridges readable when the physical structure anchor collapses", () => {
    const retained = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalVisibilityRetainedHighQEnergy: 0.24,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.72,
      ridgeSupportAnchor: 0.64,
    });
    const noRidge = deriveVisibleDensity({
      density: 0,
      modalVisibilityEnergy: 0,
      modalVisibilityRetainedHighQEnergy: 0.24,
      modalStructureAnchor: 0,
      ridgeAnchor: 0,
      ridgeSupportAnchor: 0,
    });

    expect(retained.physicalVisibleDensity).toBe(0);
    expect(retained.retainedHighQRidgeVisibleDensity).toBeGreaterThan(0.01);
    expect(retained.retainedHighQContourAccent).toBeGreaterThan(0);
    expect(noRidge.retainedHighQRidgeVisibleDensity).toBe(0);
    expect(noRidge.visibleDensity).toBe(0);
  });

  it("keeps live-measured retained high-Q ridge density above the inspection floor", () => {
    const diagnostics = deriveRetainedHighQVisibilityDiagnostics({
      modalVisibilityEnergy: 0.49,
      modalVisibilityRetainedHighQEnergy: 0.25,
    });

    expect(diagnostics.retainedHighQPhysicalVisibleDensityMax).toBe(0);
    expect(
      diagnostics.retainedHighQRidgeVisibleDensityMax,
    ).toBeGreaterThanOrEqual(0.08);
    expect(
      diagnostics.retainedHighQRidgeToRetainedEnergyRatio,
    ).toBeGreaterThanOrEqual(0.32);
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
