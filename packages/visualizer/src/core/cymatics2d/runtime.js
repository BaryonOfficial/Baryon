import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import { isFieldDrivenState } from "../fieldState.js";

const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 2.6;
const RESPONSE_IDLE_RELEASE = 5.5;
const ACCENT_ATTACK = 10;
const ACCENT_RELEASE = 6.5;
const SCALE_RESPONSE_AMOUNT = 0.02;
const DENSITY_RESPONSE_AMOUNT = 0.14;
const SLICE_VELOCITY_ATTACK = 4.2;
const SLICE_VELOCITY_RELEASE = 2.4;
const SLICE_IDLE_DRIFT = 0.22;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}

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

function countActiveSlots(slots) {
  if (!slots?.length) return 0;
  let count = 0;
  for (let i = 0; i < slots.length; i += 4) {
    if ((slots[i + 3] ?? 0) > 0) count += 1;
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

function buildCymatics2dDebugSnapshot(runtimeState, featureFrame, fieldState) {
  const avgAmplitude = estimateLayeredAmplitude(featureFrame);
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const opacityGain = runtimeState.uniforms.uOpacityGain?.value ?? 1;
  const transientEnergy = featureFrame?.transientEnergy ?? 0;
  const spectralFlux = featureFrame?.spectralFlux ?? 0;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const energySignal = featureFrame?.energySignal ?? 0;
  const changeSignal = featureFrame?.changeSignal ?? 0;
  const pulseSignal = featureFrame?.pulseSignal ?? 0;
  const avgDensity = Math.min(
    1,
    avgAmplitude * densityGain * (0.74 + transientEnergy * 0.22),
  );
  const avgOpacity = Math.min(
    1,
    avgDensity * opacityGain * (0.84 + spectralFlux * 0.12),
  );

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
    opacityGain,
    transientEnergy,
    spectralCentroid: featureFrame?.spectralCentroid ?? 0,
    spectralFlux,
    beatDetected: featureFrame?.beatDetected ?? false,
    beatPulseId: featureFrame?.beatPulseId ?? 0,
    beatStrength: featureFrame?.beatStrength ?? 0,
    beatConfidence: featureFrame?.beatConfidence ?? 0,
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    responseEnvelope: runtimeState.responseEnvelope ?? 0,
    motionSignal: runtimeState.motionSignal ?? 0,
    scaleSignal: runtimeState.scaleSignal ?? 0,
    bloomResponseSignal: runtimeState.bloomResponseSignal ?? 0,
    visualScale: runtimeState.visualRoot?.scale?.x ?? 1,
    chromesthesiaMix: runtimeState.uniforms.uChromesthesiaMix?.value ?? 0,
    slicePosition: runtimeState.uniforms.uSlicePosition?.value ?? 0,
    sliceVelocity: runtimeState.sliceVelocity ?? 0,
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
  };
}

function updateReactiveResponse(
  runtimeState,
  featureFrame,
  fieldDriven,
  deltaTime,
) {
  const tuning = {
    ...REACTIVITY_DEFAULTS,
    ...(runtimeState.reactivityTuning ?? {}),
  };
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const persistence = Math.max(0.2, tuning.structurePersistence);
  const reactivity = Math.max(0, tuning.reactivity);
  const gatedStructureSignal = clamp01(structureSignal * reactivity);
  const gatedEnergySignal = clamp01(energySignal * reactivity);
  const gatedChangeSignal = clamp01(changeSignal * reactivity);
  const gatedPulseSignal = clamp01(pulseSignal * reactivity);
  const envelopeTarget = fieldDriven
    ? clamp01(
        gatedStructureSignal * (0.34 + persistence * 0.08) +
          gatedEnergySignal * 0.38 +
          gatedChangeSignal * 0.23,
      )
    : 0;
  const responseEnvelope = damp(
    runtimeState.responseEnvelope ?? 0,
    envelopeTarget,
    envelopeTarget > (runtimeState.responseEnvelope ?? 0)
      ? RESPONSE_ATTACK
      : fieldDriven
        ? RESPONSE_RELEASE + persistence * 0.9
        : RESPONSE_IDLE_RELEASE,
    deltaTime,
  );
  const accentTarget = fieldDriven
    ? clamp01(gatedChangeSignal * 0.74 + gatedPulseSignal * 0.42)
    : 0;
  const accentEnvelope = damp(
    runtimeState.accentEnvelope ?? 0,
    accentTarget,
    accentTarget > (runtimeState.accentEnvelope ?? 0)
      ? ACCENT_ATTACK
      : ACCENT_RELEASE,
    deltaTime,
  );
  const scaleSignal = clamp01(
    responseEnvelope * 0.56 +
      gatedEnergySignal * 0.24 +
      accentEnvelope * 0.14 +
      gatedStructureSignal * 0.06,
  );
  const contourSharpness = runtimeState.uniforms.uContourSharpness?.value ?? 1;
  const contourSignal = clamp01((contourSharpness - 1) / 7);
  const bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      gatedStructureSignal * 0.2 +
      contourSignal * 0.14 * reactivity,
  );

  runtimeState.responseEnvelope = responseEnvelope;
  runtimeState.accentEnvelope = accentEnvelope;
  runtimeState.motionSignal = clamp01(
    gatedChangeSignal * 0.62 + accentEnvelope * 0.22 + gatedEnergySignal * 0.16,
  );
  runtimeState.scaleSignal = scaleSignal;
  runtimeState.bloomResponseSignal = bloomResponseSignal;
  runtimeState.visualRoot?.scale?.setScalar?.(
    1 + scaleSignal * SCALE_RESPONSE_AMOUNT,
  );
}

function updateSliceMotion(runtimeState, fieldDriven, deltaTime) {
  const motionAmount = Math.max(
    0,
    runtimeState.reactivityTuning?.motionAmount ??
      REACTIVITY_DEFAULTS.motionAmount,
  );
  const responseEnvelope = clamp01(runtimeState.responseEnvelope ?? 0);
  const motionSignal = clamp01(runtimeState.motionSignal ?? 0);
  const persistence = Math.max(
    0.2,
    runtimeState.reactivityTuning?.structurePersistence ??
      REACTIVITY_DEFAULTS.structurePersistence,
  );
  const targetVelocity = fieldDriven
    ? motionAmount *
      (0.28 +
        responseEnvelope * 0.56 +
        motionSignal * 0.44 +
        persistence * 0.04)
    : SLICE_IDLE_DRIFT;
  runtimeState.sliceVelocity = damp(
    runtimeState.sliceVelocity ?? 0,
    targetVelocity,
    targetVelocity > (runtimeState.sliceVelocity ?? 0)
      ? SLICE_VELOCITY_ATTACK
      : SLICE_VELOCITY_RELEASE,
    deltaTime,
  );
  runtimeState.slicePhase =
    (runtimeState.slicePhase ?? 0) +
    (runtimeState.sliceVelocity ?? 0) * deltaTime;
  runtimeState.uniforms.uSlicePosition.value =
    Math.sin(runtimeState.slicePhase ?? 0) *
    (0.2 + responseEnvelope * 0.55 + motionSignal * 0.15);
}

export function tickCymatics2dRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
) {
  const {
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    uniforms,
    volumeMesh,
    idleOverlay,
  } = runtimeState;

  uniforms.uTime.value = time;
  const fieldState = featureFrame?.fieldState ?? "idle";
  const fieldDriven = isFieldDrivenState(fieldState);
  updateReactiveResponse(runtimeState, featureFrame, fieldDriven, deltaTime);
  updateSliceMotion(runtimeState, fieldDriven, deltaTime);
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

  if ((uniforms.uChromesthesiaMix?.value ?? 0) > 0) {
    const backboneColorArray = backboneColorBuffer.value.array;
    backboneColorArray.fill(0);
    if (featureFrame?.backboneColorSlots?.length) {
      backboneColorArray.set(
        featureFrame.backboneColorSlots.subarray(0, backboneColorArray.length),
      );
    }
    backboneColorBuffer.value.needsUpdate = true;
  }

  const detailArray = detailModeBuffer.value.array;
  detailArray.fill(0);
  if (featureFrame?.detailSlots?.length) {
    detailArray.set(featureFrame.detailSlots.subarray(0, detailArray.length));
  }
  detailModeBuffer.value.needsUpdate = true;

  if ((uniforms.uChromesthesiaMix?.value ?? 0) > 0) {
    const detailColorArray = detailColorBuffer.value.array;
    detailColorArray.fill(0);
    if (featureFrame?.detailColorSlots?.length) {
      detailColorArray.set(
        featureFrame.detailColorSlots.subarray(0, detailColorArray.length),
      );
    }
    detailColorBuffer.value.needsUpdate = true;
  }

  const backboneModeCount =
    featureFrame?.activeBackboneModeCount ??
    countActiveSlots(featureFrame?.backboneSlots);
  const detailModeCount =
    featureFrame?.activeDetailModeCount ??
    countActiveSlots(featureFrame?.detailSlots);
  uniforms.uBackboneModeCount.value = backboneModeCount;
  uniforms.uDetailModeCount.value = detailModeCount;
  uniforms.uActiveModeCount.value = backboneModeCount + detailModeCount;
  uniforms.uAverageAmplitude.value = featureFrame?.averageAmplitude ?? 0;
  uniforms.uTransientEnergy.value = featureFrame?.transientEnergy ?? 0;
  uniforms.uSpectralCentroid.value = featureFrame?.spectralCentroid ?? 0;
  uniforms.uSpectralFlux.value = featureFrame?.spectralFlux ?? 0;
  uniforms.uDensityGain.value =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.scaleSignal ?? 0) * DENSITY_RESPONSE_AMOUNT);
  const bandEnergies = featureFrame?.bandEnergies ?? EMPTY_BAND_ENERGIES;
  uniforms.uBandEnergies.value.set(
    bandEnergies[0] ?? 0,
    bandEnergies[1] ?? 0,
    bandEnergies[2] ?? 0,
    bandEnergies[3] ?? 0,
  );

  volumeMesh.visible = fieldDriven;
  idleOverlay.visible = !fieldDriven;

  const cymatics2dDebug = buildCymatics2dDebugSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
  );
  runtimeState.debugSnapshot = featureFrame?.debug
    ? { ...featureFrame.debug, cymatics2dDebug, ...cymatics2dDebug }
    : cymatics2dDebug;
}

export function disposeCymatics2dRuntime(runtimeState) {
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
}

export function createCymatics2dSceneRoot({ fieldMesh, idleOverlay }) {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  visualRoot.add(fieldMesh);
  visualRoot.add(idleOverlay);
  root.add(visualRoot);

  return { root, visualRoot };
}
