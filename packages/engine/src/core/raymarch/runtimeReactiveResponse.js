// Owns dimensionless presentation response derived from the current frame.
// This state may drive presentation motion, but it never grants render
// authority or mutates canonical field, modal, cache, or transport state.
import { AUDIO_RESPONSE_GAIN } from "../../defaults.js";
import { clamp01, damp } from "../../utils/math.js";
import { readRuntimeModalResponseEnergy } from "./runtimeModalResponse.js";
import { resolveRaymarchStructuralProjectionDrive } from "./runtimeStateSelectors.js";

const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 3.6;
const DECAY_RELEASE_ENERGY_END = 0.22;
const DECAY_RELEASE_CHANGE_END = 0.12;
const DECAY_RELEASE_STRUCTURE_END = 0.42;
const DECAY_RELEASE_TARGET_REDUCTION = 0.55;
const DECAY_RELEASE_RATE_GAIN = 1.9;
const ACCENT_ATTACK = 15;
const ACCENT_RELEASE = 11;

function deriveDecayReleaseMask({
  fieldState,
  responseStructureSignal,
  responseEnergySignal,
  responseChangeSignal,
}) {
  if (fieldState !== "decay") {
    return 0;
  }

  const lowEnergyMask = clamp01(
    (DECAY_RELEASE_ENERGY_END - responseEnergySignal) /
      DECAY_RELEASE_ENERGY_END,
  );
  const lowChangeMask = clamp01(
    (DECAY_RELEASE_CHANGE_END - responseChangeSignal) /
      DECAY_RELEASE_CHANGE_END,
  );
  const lowStructureMask = clamp01(
    (DECAY_RELEASE_STRUCTURE_END - responseStructureSignal) /
      DECAY_RELEASE_STRUCTURE_END,
  );

  return clamp01(Math.min(lowEnergyMask, lowChangeMask) * lowStructureMask);
}

export function updateRaymarchReactiveResponse(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
  deltaTime,
) {
  runtimeState.visualRoot?.scale?.setScalar?.(1);
  if (!renderAuthority) {
    runtimeState.responseEnvelope = 0;
    runtimeState.summaryResponseEnvelope = 0;
    runtimeState.accentEnvelope = 0;
    runtimeState.motionSignal = 0;
    runtimeState.scaleSignal = 0;
    runtimeState.bloomResponseSignal = 0;
    return;
  }

  const responseStructureSignal = clamp01(
    (featureFrame?.structureSignal ?? 0) * AUDIO_RESPONSE_GAIN,
  );
  const responseEnergySignal = clamp01(
    (featureFrame?.energySignal ?? 0) * AUDIO_RESPONSE_GAIN,
  );
  const responseChangeSignal = clamp01(
    (featureFrame?.changeSignal ?? 0) * AUDIO_RESPONSE_GAIN,
  );
  const responsePulseSignal = clamp01(
    (featureFrame?.pulseSignal ?? 0) * AUDIO_RESPONSE_GAIN,
  );
  const uploadedModeCount = Math.max(
    0,
    Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    uploadedModeCount,
    featureFrame,
  );
  // Only one of these two carries a temporal model, and they must not be
  // filtered alike. modalOscillatorEnergy combines the currently observed
  // forced solution with Q-dependent stored residue. projectionEnergyDrive is
  // a pure function of the current frame's modal slots -- no history, no
  // integration -- so it is an independent per-frame estimate and still needs
  // an envelope to be continuous.
  const modalOscillatorEnergy = clamp01(
    readRuntimeModalResponseEnergy(runtimeState, featureFrame) *
      AUDIO_RESPONSE_GAIN,
  );
  const projectionEnergyDrive = clamp01(
    structuralProjection.projectionEnergyDrive * AUDIO_RESPONSE_GAIN,
  );
  const responseModalEnergy = Math.max(
    modalOscillatorEnergy,
    projectionEnergyDrive,
  );
  // Preserves the max above exactly in steady state -- the damped lane carries
  // only what the projection adds beyond the oscillator -- while letting the
  // integrated term through at its own rate.
  const projectionEnergyExcess = Math.max(
    0,
    projectionEnergyDrive - modalOscillatorEnergy,
  );
  const decayReleaseMask = deriveDecayReleaseMask({
    fieldState,
    responseStructureSignal,
    responseEnergySignal,
    responseChangeSignal,
  });
  // Two lanes with different provenance, so only one of them may be damped.
  //
  // The structure/energy/change signals are heuristic per-frame summaries of a
  // noisy spectral estimate. They carry no temporal model, so consecutive
  // frames are independent draws and an envelope is what makes them continuous.
  //
  // responseModalEnergy is not that. modalResponse.js publishes the current
  // forced response immediately and applies the physical modal time constant
  // only to stored residue: stored energy decays as exp(-w0 t / Q), with
  // tau = Q / w0 = Q / (2 pi f). Damping that value again applies a second,
  // frequency-independent lag on top of a decay the cavity already performed
  // per mode. That is what made the shapes track the music while the brightness
  // dragged behind them: the pattern reads modal energy directly, while the
  // display response had read it through another envelope.
  const summaryEnvelopeTarget = clamp01(
    responseStructureSignal *
      0.34 *
      (1 - decayReleaseMask * DECAY_RELEASE_TARGET_REDUCTION) +
      responseEnergySignal * 0.38 +
      responseChangeSignal * 0.23 +
      projectionEnergyExcess * 0.48,
  );
  // The damped lane is now the state that carries history, but callers that
  // predate it -- restored snapshots, externally built runtime state -- only
  // carry the published composite. Bootstrapping from that keeps the filter
  // continuous instead of silently restarting it from zero while the published
  // value claims otherwise. It reads slightly high for exactly one tick, since
  // the composite also carries the undamped modal term, and tracks
  // independently from then on.
  const previousSummaryEnvelope = Number.isFinite(
    runtimeState.summaryResponseEnvelope,
  )
    ? runtimeState.summaryResponseEnvelope
    : (runtimeState.responseEnvelope ?? 0);
  const summaryEnvelope = damp(
    previousSummaryEnvelope,
    summaryEnvelopeTarget,
    summaryEnvelopeTarget > previousSummaryEnvelope
      ? RESPONSE_ATTACK
      : RESPONSE_RELEASE * (1 + decayReleaseMask * DECAY_RELEASE_RATE_GAIN),
    deltaTime,
  );
  const responseEnvelope = clamp01(
    summaryEnvelope + modalOscillatorEnergy * 0.48,
  );
  const accentTarget = clamp01(
    responseChangeSignal * 0.74 + responsePulseSignal * 0.42,
  );
  const previousAccentEnvelope = runtimeState.accentEnvelope ?? 0;
  const accentEnvelope = damp(
    previousAccentEnvelope,
    accentTarget,
    accentTarget > previousAccentEnvelope ? ACCENT_ATTACK : ACCENT_RELEASE,
    deltaTime,
  );

  runtimeState.responseEnvelope = responseEnvelope;
  // The damped lane persists on its own so the envelope integrates only its own
  // history. Feeding the published composite back in would let the undamped
  // modal term drive the filter it is meant to bypass.
  runtimeState.summaryResponseEnvelope = summaryEnvelope;
  runtimeState.accentEnvelope = accentEnvelope;
  runtimeState.motionSignal = clamp01(
    responseChangeSignal * 0.62 +
      accentEnvelope * 0.22 +
      responseEnergySignal * 0.16,
  );
  runtimeState.scaleSignal = clamp01(
    responseEnvelope * 0.56 +
      responseEnergySignal * 0.24 +
      accentEnvelope * 0.14 +
      responseStructureSignal * 0.06 +
      responseModalEnergy * 0.08,
  );
  runtimeState.bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      responseStructureSignal * 0.2 +
      responseModalEnergy * 0.08,
  );
}
