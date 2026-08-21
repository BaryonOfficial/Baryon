// Translates authoritative runtime and feature state into shader-facing
// uniforms. This module owns projection and reset semantics; it never decides
// whether render authority is open or whether retained live state is drawable.
import { clamp, clamp01, damp } from "../../utils/math.js";
import { readRuntimeModalResponseEnergy } from "./runtimeModalResponse.js";
import { resolveRaymarchStructuralProjectionDrive } from "./runtimeStateSelectors.js";

const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const BEAT_PHASE_CORRECTION_RATE_CYCLES_PER_SEC = 2.4;
const SCALAR_FEATURE_UNIFORM_BINDINGS = Object.freeze([
  ["uAverageAmplitude", "averageAmplitude"],
  ["uTransientEnergy", "transientEnergy"],
  ["uSpectralCentroid", "spectralCentroid"],
  ["uSpectralFlux", "spectralFlux"],
  ["uStructureSignal", "structureSignal"],
  ["uEnergySignal", "energySignal"],
  ["uChangeSignal", "changeSignal"],
  ["uBassSalience", "bassSalience"],
  ["uTimbreSpread", "timbreSpread"],
  ["uSpectralNovelty", "spectralNovelty"],
]);

export function setRaymarchUniformIfChanged(uniformNode, value) {
  if (uniformNode && uniformNode.value !== value) {
    uniformNode.value = value;
  }
}

function syncScalarFeatureUniforms(uniforms, featureFrame) {
  for (const [uniformName, featureName] of SCALAR_FEATURE_UNIFORM_BINDINGS) {
    setRaymarchUniformIfChanged(
      uniforms[uniformName],
      featureFrame?.[featureName] ?? 0,
    );
  }
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function wrapUnitPhase(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function signedUnitPhaseDelta(from, to) {
  const delta = wrapUnitPhase(to) - wrapUnitPhase(from);
  if (delta > 0.5) {
    return delta - 1;
  }
  if (delta < -0.5) {
    return delta + 1;
  }
  return delta;
}

function deriveBeatPhaseAuthority(featureFrame) {
  const tempoAuthority = clamp01(featureFrame?.tempoConfidence ?? 0);
  const beatAuthority =
    featureFrame?.beatDetected === true
      ? clamp01(
          (featureFrame?.beatStrength ?? 0) * 0.7 +
            (featureFrame?.beatConfidence ?? 0) * 0.3,
        )
      : 0;

  return Math.max(tempoAuthority, beatAuthority);
}

function resolveShaderBeatPhase(runtimeState, featureFrame, deltaTime) {
  const sourcePhase = clamp01(readFiniteNumber(featureFrame?.beatPhase, 0));
  const previousPhase = runtimeState.shaderBeatPhase;
  if (!Number.isFinite(previousPhase)) {
    runtimeState.shaderBeatPhase = sourcePhase;
    return sourcePhase;
  }

  const safeDeltaTime = Math.max(0, readFiniteNumber(deltaTime, 0));
  const estimatedTempo = Math.max(
    0,
    readFiniteNumber(featureFrame?.estimatedTempo, 0),
  );
  const predictedPhase = wrapUnitPhase(
    previousPhase + (estimatedTempo / 60) * safeDeltaTime,
  );
  const maxCorrection =
    BEAT_PHASE_CORRECTION_RATE_CYCLES_PER_SEC *
    deriveBeatPhaseAuthority(featureFrame) *
    safeDeltaTime;
  const phaseCorrection = clamp(
    signedUnitPhaseDelta(predictedPhase, sourcePhase),
    -maxCorrection,
    maxCorrection,
  );
  const shaderBeatPhase = wrapUnitPhase(predictedPhase + phaseCorrection);

  runtimeState.shaderBeatPhase = shaderBeatPhase;
  return shaderBeatPhase;
}

function setBandEnergies(uniformNode, bandEnergies = EMPTY_BAND_ENERGIES) {
  const value = uniformNode?.value;
  if (!value?.set) {
    return;
  }

  const nextX = bandEnergies[0] ?? 0;
  const nextY = bandEnergies[1] ?? 0;
  const nextZ = bandEnergies[2] ?? 0;
  const nextW = bandEnergies[3] ?? 0;
  if (
    value.x !== nextX ||
    value.y !== nextY ||
    value.z !== nextZ ||
    value.w !== nextW
  ) {
    value.set(nextX, nextY, nextZ, nextW);
  }
}

function clearRaymarchFeatureUniforms(runtimeState) {
  const uniforms = runtimeState.uniforms;
  runtimeState.beatPulseEnvelope = 0;
  runtimeState.shaderBeatPhase = null;
  setRaymarchUniformIfChanged(uniforms.uModalFieldModeCount, 0);
  syncScalarFeatureUniforms(uniforms, null);
  setRaymarchUniformIfChanged(uniforms.uBeatPulse, 0);
  setRaymarchUniformIfChanged(uniforms.uBeatPhase, 0);
  setRaymarchUniformIfChanged(uniforms.uTempoNorm, 0);
  setRaymarchUniformIfChanged(uniforms.uRhythmicDensity, 0);
  setRaymarchUniformIfChanged(uniforms.uTrebleBroadbandEnergy, 0);
  setRaymarchUniformIfChanged(uniforms.uModeCoherence, 0);
  setRaymarchUniformIfChanged(uniforms.uTotalSlotAmplitude, 0);
  runtimeState.raymarchStructuralProjection = null;
  setRaymarchUniformIfChanged(uniforms.uModalResponseEnergy, 0);
  setBandEnergies(uniforms.uBandEnergies);
}

function syncModalFrameProjectionUniforms(uniforms, modalFrameProjection) {
  const activeModeCount = modalFrameProjection?.modalFieldModeCount;
  if (Number.isFinite(activeModeCount)) {
    setRaymarchUniformIfChanged(
      uniforms.uModalFieldModeCount,
      Math.max(0, Math.floor(activeModeCount)),
    );
  }
}

function syncRaymarchRhythmicUniforms(runtimeState, featureFrame, deltaTime) {
  const uniforms = runtimeState.uniforms;
  const beatTarget =
    featureFrame.beatDetected && (featureFrame.beatStrength ?? 0) > 0.3
      ? clamp01(
          (featureFrame.beatStrength ?? 0) * 0.8 +
            (featureFrame.beatConfidence ?? 0) * 0.2,
        )
      : 0;
  const previousBeatPulse = runtimeState.beatPulseEnvelope ?? 0;
  runtimeState.beatPulseEnvelope = damp(
    previousBeatPulse,
    beatTarget,
    beatTarget > previousBeatPulse ? 25 : 8,
    deltaTime,
  );
  setRaymarchUniformIfChanged(
    uniforms.uBeatPulse,
    runtimeState.beatPulseEnvelope,
  );
  setRaymarchUniformIfChanged(
    uniforms.uBeatPhase,
    resolveShaderBeatPhase(runtimeState, featureFrame, deltaTime),
  );
  setRaymarchUniformIfChanged(
    uniforms.uTempoNorm,
    clamp01(((featureFrame.estimatedTempo ?? 0) - 40) / 200),
  );
  setRaymarchUniformIfChanged(
    uniforms.uRhythmicDensity,
    featureFrame.rhythmicDensity ?? 0,
  );
  setRaymarchUniformIfChanged(
    uniforms.uTrebleBroadbandEnergy,
    featureFrame.trebleBroadbandEnergy ?? 0,
  );
  setRaymarchUniformIfChanged(
    uniforms.uModeCoherence,
    featureFrame.modeCoherence ?? 0,
  );
}

function syncRaymarchStructuralUniforms(runtimeState, featureFrame) {
  const uniforms = runtimeState.uniforms;
  const activeModeCount = uniforms.uModalFieldModeCount?.value ?? 0;
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    activeModeCount,
    featureFrame,
  );
  setRaymarchUniformIfChanged(
    uniforms.uTotalSlotAmplitude,
    structuralProjection.amplitudeSum,
  );
  runtimeState.raymarchStructuralProjection = structuralProjection;
  setRaymarchUniformIfChanged(
    uniforms.uModalResponseEnergy,
    readRuntimeModalResponseEnergy(runtimeState, featureFrame),
  );
}

function syncRaymarchFeatureUniforms(
  runtimeState,
  featureFrame,
  deltaTime,
  modalFrameProjection,
) {
  const currentFeatureFrame = featureFrame ?? {};
  const uniforms = runtimeState.uniforms;
  syncModalFrameProjectionUniforms(uniforms, modalFrameProjection);
  syncScalarFeatureUniforms(uniforms, currentFeatureFrame);
  syncRaymarchRhythmicUniforms(runtimeState, currentFeatureFrame, deltaTime);
  syncRaymarchStructuralUniforms(runtimeState, currentFeatureFrame);
  setBandEnergies(uniforms.uBandEnergies, currentFeatureFrame.bandEnergies);
}

function syncRaymarchMaterialUniforms(runtimeState) {
  const bloomTuning = runtimeState.bloomTuning;
  const baseBloomStrength =
    bloomTuning?.baseStrength ?? bloomTuning?.effectiveStrength ?? 0;
  const baseBloomRadius =
    bloomTuning?.baseRadius ?? bloomTuning?.effectiveRadius ?? 0;
  const baseBloomThreshold =
    bloomTuning?.baseThreshold ?? bloomTuning?.effectiveThreshold ?? 0;

  bloomTuning.effectiveStrength = baseBloomStrength;
  bloomTuning.effectiveRadius = Math.max(0, baseBloomRadius);
  bloomTuning.effectiveThreshold = clamp(baseBloomThreshold, 0, 1);
  bloomTuning.bloomAllowed = true;
}

function syncBaseDensityUniform(runtimeState) {
  const uniforms = runtimeState.uniforms;
  setRaymarchUniformIfChanged(
    uniforms.uDensityGain,
    runtimeState.baseDensityGain ?? uniforms.uDensityGain.value,
  );
}

export function clearRaymarchUniformProjection(runtimeState) {
  clearRaymarchFeatureUniforms(runtimeState);
  syncBaseDensityUniform(runtimeState);
}

export function syncRaymarchUniformProjection(
  runtimeState,
  featureFrame,
  deltaTime,
  modalFrameProjection = null,
) {
  syncRaymarchFeatureUniforms(
    runtimeState,
    featureFrame,
    deltaTime,
    modalFrameProjection,
  );
  syncRaymarchMaterialUniforms(runtimeState);
  syncBaseDensityUniform(runtimeState);
}
