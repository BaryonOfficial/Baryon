import * as THREE from "three";
import { BEAT_DEFAULTS } from "../../defaults.js";
import { isFieldDrivenState } from "../fieldState.js";

const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);

function estimateAverageModeAmplitude(modeSlots) {
  if (!modeSlots?.length) return 0;

  let total = 0;
  let count = 0;
  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3] ?? 0;
    if (amplitude <= 0) continue;
    total += amplitude;
    count += 1;
  }

  return count > 0 ? total / count : 0;
}

function countActiveModes(modeSlots) {
  if (!modeSlots?.length) return 0;

  let count = 0;
  for (let i = 0; i < modeSlots.length; i += 4) {
    if ((modeSlots[i + 3] ?? 0) > 0) count += 1;
  }

  return count;
}

function estimateLayeredAmplitude(featureFrame) {
  const backboneAmplitude = estimateAverageModeAmplitude(
    featureFrame?.backboneSlots,
  );
  const detailAmplitude = estimateAverageModeAmplitude(
    featureFrame?.detailSlots,
  );
  return backboneAmplitude + detailAmplitude * 0.35;
}

function buildRaymarchDebugSnapshot(runtimeState, featureFrame, fieldState) {
  const avgAmplitude = estimateLayeredAmplitude(featureFrame);
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const absorption = runtimeState.uniforms.uAbsorption.value;
  const stepBudget = Math.round(runtimeState.volumeMesh.material.steps);
  const rimBloomBias = runtimeState.uniforms.uRimBloomBias?.value ?? 0;
  const rimCompression = runtimeState.uniforms.uRimCompression?.value ?? 0;
  const bloomResponseBias = runtimeState.bloomTuning?.bloomResponseBias ?? 0;
  const stepReference = runtimeState.bloomTuning?.stepReference ?? stepBudget;
  const stepCompensation = runtimeState.bloomTuning?.stepCompensation ?? 1;
  const lowStepBloomGuard = runtimeState.bloomTuning?.lowStepBloomGuard ?? 0;
  const effectiveBloomStrength =
    runtimeState.bloomTuning?.effectiveStrength ?? 0;
  const effectiveBloomThreshold =
    runtimeState.bloomTuning?.effectiveThreshold ?? 0;
  const transientEnergy = featureFrame?.transientEnergy ?? 0;
  const spectralFlux = featureFrame?.spectralFlux ?? 0;
  const avgDensity = Math.min(
    1,
    avgAmplitude * densityGain * absorption * (0.75 + transientEnergy * 0.2),
  );
  const avgOpacity = Math.min(
    1,
    avgDensity * (stepBudget / 48) * (0.8 + spectralFlux * 0.12),
  );
  const earlyExitRatio = Math.min(1, avgOpacity * 0.72);
  const bloomRisk = Math.min(
    1,
    avgDensity *
      (1 + rimBloomBias * 0.22) *
      (1 - rimCompression * 0.12) *
      (0.7 + effectiveBloomStrength * 1.6) *
      (1.1 - effectiveBloomThreshold * 0.4) *
      (1 - bloomResponseBias * 0.18),
  );
  const {
    avgRaySegmentLength = 0,
    missRatio = 0,
    avgSilhouetteSuppression = 0,
  } = runtimeState.stabilityStats ?? {};

  return {
    fieldState,
    modeSlotCount: runtimeState.uniforms.uActiveModeCount.value,
    backboneModeCount: runtimeState.uniforms.uBackboneModeCount.value,
    detailModeCount: runtimeState.uniforms.uDetailModeCount.value,
    dominantFrequency:
      featureFrame?.debug?.dominantFrequency ??
      featureFrame?.debug?.fundamentalFrequency ??
      0,
    avgOpacity,
    avgDensity,
    earlyExitRatio,
    stepBudget,
    transientEnergy,
    spectralCentroid: featureFrame?.spectralCentroid ?? 0,
    spectralFlux,
    beatDetected: featureFrame?.beatDetected ?? false,
    beatPulseId: featureFrame?.beatPulseId ?? 0,
    beatStrength: featureFrame?.beatStrength ?? 0,
    beatConfidence: featureFrame?.beatConfidence ?? 0,
    pulseEnvelope: runtimeState.pulseEnvelope ?? 0,
    visualScale: runtimeState.visualRoot?.scale?.x ?? 1,
    stepReference,
    stepCompensation,
    lowStepBloomGuard,
    rimBloomBias,
    rimCompression,
    bloomResponseBias,
    effectiveBloomStrength,
    effectiveBloomThreshold,
    bloomRisk,
    avgRaySegmentLength,
    missRatio,
    avgSilhouetteSuppression,
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
  };
}

function applyPulseEnvelope(runtimeState, featureFrame, deltaTime) {
  const pulseAmount =
    runtimeState.beatTuning?.pulseAmount ?? BEAT_DEFAULTS.pulseAmount;
  const pulseDecayMs =
    runtimeState.beatTuning?.pulseDecayMs ?? BEAT_DEFAULTS.pulseDecayMs;
  const beatPulseId = featureFrame?.beatPulseId ?? 0;
  let triggered = false;

  if (
    beatPulseId > 0 &&
    beatPulseId !== runtimeState.lastConsumedBeatPulseId &&
    featureFrame?.beatDetected
  ) {
    runtimeState.lastConsumedBeatPulseId = beatPulseId;
    runtimeState.pulseEnvelope = Math.max(
      runtimeState.pulseEnvelope ?? 0,
      featureFrame?.beatStrength ?? 0,
    );
    triggered = true;
  }

  if (!triggered) {
    const decayFactor = Math.exp(
      -Math.max(0, deltaTime * 1000) / Math.max(1, pulseDecayMs),
    );
    runtimeState.pulseEnvelope =
      (runtimeState.pulseEnvelope ?? 0) * decayFactor;
  }
  if ((runtimeState.pulseEnvelope ?? 0) < 1e-4) {
    runtimeState.pulseEnvelope = 0;
  }

  runtimeState.visualRoot?.scale?.setScalar?.(
    1 + (runtimeState.pulseEnvelope ?? 0) * pulseAmount,
  );
}

export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
) {
  const {
    backboneModeBuffer,
    detailModeBuffer,
    uniforms,
    volumeMesh,
    idleOverlay,
  } = runtimeState;

  uniforms.uTime.value = time;
  applyPulseEnvelope(runtimeState, featureFrame, deltaTime);
  const fieldState = featureFrame?.fieldState ?? "idle";
  const fieldDriven = isFieldDrivenState(fieldState);
  uniforms.uFieldState.value =
    runtimeState.fieldStateValues[fieldState] ??
    runtimeState.fieldStateValues.idle;

  const backboneArray = backboneModeBuffer.value.array;
  backboneArray.fill(0);
  if (featureFrame?.backboneSlots?.length) {
    backboneArray.set(
      featureFrame.backboneSlots.subarray(0, backboneArray.length),
    );
  }
  backboneModeBuffer.value.needsUpdate = true;

  const detailArray = detailModeBuffer.value.array;
  detailArray.fill(0);
  if (featureFrame?.detailSlots?.length) {
    detailArray.set(featureFrame.detailSlots.subarray(0, detailArray.length));
  }
  detailModeBuffer.value.needsUpdate = true;

  const backboneModeCount = countActiveModes(featureFrame?.backboneSlots);
  const detailModeCount = countActiveModes(featureFrame?.detailSlots);
  uniforms.uBackboneModeCount.value = backboneModeCount;
  uniforms.uDetailModeCount.value = detailModeCount;
  uniforms.uActiveModeCount.value = backboneModeCount + detailModeCount;
  uniforms.uAverageAmplitude.value = featureFrame?.averageAmplitude ?? 0;
  uniforms.uTransientEnergy.value = featureFrame?.transientEnergy ?? 0;
  uniforms.uSpectralCentroid.value = featureFrame?.spectralCentroid ?? 0;
  uniforms.uSpectralFlux.value = featureFrame?.spectralFlux ?? 0;
  uniforms.uDensityGain.value =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.pulseEnvelope ?? 0) * 0.12);
  const bandEnergies = featureFrame?.bandEnergies ?? EMPTY_BAND_ENERGIES;
  uniforms.uBandEnergies.value.set(
    bandEnergies[0] ?? 0,
    bandEnergies[1] ?? 0,
    bandEnergies[2] ?? 0,
    bandEnergies[3] ?? 0,
  );

  volumeMesh.visible = fieldDriven;
  idleOverlay.visible = !fieldDriven;

  const raymarchDebug = buildRaymarchDebugSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
  );
  runtimeState.debugSnapshot = featureFrame?.debug
    ? { ...featureFrame.debug, raymarchDebug, ...raymarchDebug }
    : raymarchDebug;
}

export function disposeRaymarchRuntime(runtimeState) {
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
    if (child.isLight && child.shadow?.map) {
      child.shadow.map.dispose?.();
    }
  });
}

export function createRaymarchSceneRoot({ volumeMesh, idleOverlay, radius }) {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  visualRoot.add(volumeMesh);
  visualRoot.add(idleOverlay);
  root.add(visualRoot);

  const keyLight = new THREE.PointLight(0xbfe3ff, 26, radius * 8, 2);
  keyLight.position.set(radius * 1.5, radius * 1.2, radius * 2.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(256, 256);
  root.add(keyLight);

  const fillLight = new THREE.PointLight(0x4a8cff, 18, radius * 8, 2);
  fillLight.position.set(-radius * 1.7, -radius * 1.1, radius * 1.8);
  fillLight.castShadow = true;
  fillLight.shadow.mapSize.set(256, 256);
  root.add(fillLight);

  return { root, visualRoot };
}
