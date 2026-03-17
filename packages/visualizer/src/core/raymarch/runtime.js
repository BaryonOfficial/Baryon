import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import { isFieldDrivenState } from "../fieldState.js";
import {
  deriveHolographicColorMix,
  deriveHolographicFresnel,
} from "./fieldShaping.js";

const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 2.6;
const RESPONSE_IDLE_RELEASE = 5.5;
const RHYTHMIC_RELEASE_RATE_GAIN = 2.5;
const ACCENT_ATTACK = 15;
const ACCENT_RELEASE = 8.5;
const SCALE_RESPONSE_AMOUNT = 0.065;
const DENSITY_RESPONSE_AMOUNT = 0.08;
const THRESHOLD_RESPONSE_REDUCTION = 0.42;
const CONTOUR_RESPONSE_GAIN = 1.85;
const BLOOM_STRENGTH_RESPONSE_GAIN = 0.24;
const BLOOM_RADIUS_RESPONSE_GAIN = 0.22;
const BLOOM_THRESHOLD_RESPONSE_GAIN = 0.06;
const EARLY_EXIT_TRANSMITTANCE_EPSILON = 1e-3;

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

function setIfChanged(uniformNode, value) {
  if (uniformNode.value !== value) uniformNode.value = value;
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

function deriveLightAsymmetry(primaryIntensity, secondaryIntensity) {
  const strongest = Math.max(primaryIntensity, secondaryIntensity, 1e-4);
  return Math.abs(primaryIntensity - secondaryIntensity) / strongest;
}

function buildRaymarchDebugSnapshot(runtimeState, featureFrame, fieldState) {
  const avgAmplitude = estimateLayeredAmplitude(featureFrame);
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const absorption = runtimeState.uniforms.uAbsorption.value;
  const opacityGain = runtimeState.uniforms.uOpacityGain?.value ?? 1;
  const stepBudget = Math.round(runtimeState.volumeMesh.material.steps);
  const rimBloomBias = runtimeState.uniforms.uRimBloomBias?.value ?? 0;
  const rimCompression = runtimeState.uniforms.uRimCompression?.value ?? 0;
  const holographicIntensity =
    runtimeState.uniforms.uHolographicIntensity?.value ?? 0;
  const holographicShift = runtimeState.uniforms.uHolographicShift?.value ?? 0;
  const holographicFresnelPower =
    runtimeState.uniforms.uHolographicFresnelPower?.value ?? 0;
  const bloomResponseBias = runtimeState.bloomTuning?.bloomResponseBias ?? 0;
  const stepReference = runtimeState.bloomTuning?.stepReference ?? stepBudget;
  const stepCompensation = runtimeState.bloomTuning?.stepCompensation ?? 1;
  const lowStepBloomGuard = runtimeState.bloomTuning?.lowStepBloomGuard ?? 0;
  const effectiveBloomStrength =
    runtimeState.bloomTuning?.effectiveStrength ?? 0;
  const effectiveBloomRadius = runtimeState.bloomTuning?.effectiveRadius ?? 0;
  const effectiveBloomThreshold =
    runtimeState.bloomTuning?.effectiveThreshold ?? 0;
  const transientEnergy = featureFrame?.transientEnergy ?? 0;
  const spectralFlux = featureFrame?.spectralFlux ?? 0;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const energySignal = featureFrame?.energySignal ?? 0;
  const changeSignal = featureFrame?.changeSignal ?? 0;
  const pulseSignal = featureFrame?.pulseSignal ?? 0;
  const avgDensity = Math.min(
    1,
    avgAmplitude * densityGain * absorption * (0.75 + transientEnergy * 0.2),
  );
  const avgOpacity = Math.min(
    1,
    avgDensity * opacityGain * (stepBudget / 48) * (0.8 + spectralFlux * 0.12),
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
  const primaryLightIntensity =
    runtimeState.sceneLighting?.primary?.intensity ?? 0;
  const secondaryLightIntensity =
    runtimeState.sceneLighting?.secondary?.intensity ?? 0;
  const { holographicFresnel } = deriveHolographicFresnel({
    normalViewDot: 0.35,
    holographicIntensity,
    holographicFresnelPower,
  });
  const { colorMix: holographicColorMix, emissiveLift } =
    deriveHolographicColorMix({
      baseColor: [0.34, 0.62, 0.9],
      surfaceColor: [0.66, 0.86, 1.0],
      holographicShift,
      holographicFresnel,
    });
  const holographicReferenceStrength =
    holographicFresnel * (0.7 + holographicColorMix * 0.3) + emissiveLift * 0.2;

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
    earlyExitEnabled: true,
    earlyExitThreshold: EARLY_EXIT_TRANSMITTANCE_EPSILON,
    earlyExitRatio,
    stepBudget,
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
    stepReference,
    stepCompensation,
    lowStepBloomGuard,
    rimBloomBias,
    rimCompression,
    holographicIntensity,
    holographicShift,
    holographicFresnelPower,
    bloomResponseBias,
    effectiveBloomStrength,
    effectiveBloomRadius,
    effectiveBloomThreshold,
    bloomRisk,
    effectiveThreshold: runtimeState.uniforms.uThreshold?.value ?? 0,
    effectiveContourSharpness:
      runtimeState.uniforms.uContourSharpness?.value ?? 0,
    chromesthesiaMix: runtimeState.uniforms.uChromesthesiaMix?.value ?? 0,
    holographicReferenceStrength,
    avgRaySegmentLength,
    missRatio,
    avgSilhouetteSuppression,
    primaryLightIntensity,
    secondaryLightIntensity,
    sceneLightAsymmetry: deriveLightAsymmetry(
      primaryLightIntensity,
      secondaryLightIntensity,
    ),
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
  const rhythmicDensity = clamp01(featureFrame?.rhythmicDensity ?? 0);
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
        ? (RESPONSE_RELEASE + persistence * 0.9) *
          (1 + rhythmicDensity * RHYTHMIC_RELEASE_RATE_GAIN)
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

function updateLaserResponse(runtimeState, featureFrame) {
  const uniforms = runtimeState.uniforms;
  const baseThreshold =
    runtimeState.baseThreshold ?? uniforms.uThreshold?.value ?? 0.001;
  const baseContourSharpness =
    runtimeState.baseContourSharpness ?? uniforms.uContourSharpness?.value ?? 1;
  const baseBloomStrength =
    runtimeState.bloomTuning?.baseStrength ??
    runtimeState.bloomTuning?.effectiveStrength ??
    0;
  const baseBloomRadius =
    runtimeState.bloomTuning?.baseRadius ??
    runtimeState.bloomTuning?.effectiveRadius ??
    0;
  const baseBloomThreshold =
    runtimeState.bloomTuning?.baseThreshold ??
    runtimeState.bloomTuning?.effectiveThreshold ??
    0;
  const reactiveGate = clamp01(runtimeState.reactivityTuning?.reactivity ?? 1);
  const transientEnergy =
    clamp01(featureFrame?.transientEnergy ?? 0) * reactiveGate;
  const spectralFlux = clamp01(featureFrame?.spectralFlux ?? 0) * reactiveGate;
  const responseEnvelope = clamp01(runtimeState.responseEnvelope ?? 0);
  const accentEnvelope = clamp01(runtimeState.accentEnvelope ?? 0);
  const bloomResponseSignal = clamp01(runtimeState.bloomResponseSignal ?? 0);
  const thresholdResponse = clamp01(
    responseEnvelope * 0.24 +
      accentEnvelope * 0.58 +
      bloomResponseSignal * 0.22 +
      transientEnergy * 0.18,
  );
  const contourResponse = clamp01(
    responseEnvelope * 0.2 +
      accentEnvelope * 0.66 +
      bloomResponseSignal * 0.28 +
      transientEnergy * 0.34 +
      spectralFlux * 0.22,
  );
  const bloomPulse = clamp01(
    accentEnvelope * 0.68 + bloomResponseSignal * 0.42 + transientEnergy * 0.28,
  );

  uniforms.uThreshold.value = Math.max(
    0.001,
    baseThreshold * (1 - thresholdResponse * THRESHOLD_RESPONSE_REDUCTION),
  );
  uniforms.uContourSharpness.value = clamp(
    baseContourSharpness + contourResponse * CONTOUR_RESPONSE_GAIN,
    1,
    8,
  );
  runtimeState.bloomTuning = {
    ...(runtimeState.bloomTuning ?? {}),
    effectiveStrength:
      baseBloomStrength * (1 + bloomPulse * BLOOM_STRENGTH_RESPONSE_GAIN),
    effectiveRadius: Math.max(
      0,
      baseBloomRadius * (1 - bloomPulse * BLOOM_RADIUS_RESPONSE_GAIN),
    ),
    effectiveThreshold: clamp(
      baseBloomThreshold + bloomPulse * BLOOM_THRESHOLD_RESPONSE_GAIN,
      0,
      1,
    ),
  };
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
  setIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  const backboneArray = backboneModeBuffer.value.array;
  const backboneDataLen = featureFrame?.backboneSlots?.length
    ? Math.min(featureFrame.backboneSlots.length, backboneArray.length)
    : 0;
  if (backboneDataLen > 0) {
    backboneArray.set(featureFrame.backboneSlots.subarray(0, backboneDataLen));
  }
  if (backboneDataLen < backboneArray.length) {
    backboneArray.fill(0, backboneDataLen);
  }
  backboneModeBuffer.value.needsUpdate = true;
  if ((uniforms.uChromesthesiaMix?.value ?? 0) > 0) {
    const backboneColorArray = backboneColorBuffer.value.array;
    const bcDataLen = featureFrame?.backboneColorSlots?.length
      ? Math.min(
          featureFrame.backboneColorSlots.length,
          backboneColorArray.length,
        )
      : 0;
    if (bcDataLen > 0) {
      backboneColorArray.set(
        featureFrame.backboneColorSlots.subarray(0, bcDataLen),
      );
    }
    if (bcDataLen < backboneColorArray.length) {
      backboneColorArray.fill(0, bcDataLen);
    }
    backboneColorBuffer.value.needsUpdate = true;
  }

  const detailArray = detailModeBuffer.value.array;
  const detailDataLen = featureFrame?.detailSlots?.length
    ? Math.min(featureFrame.detailSlots.length, detailArray.length)
    : 0;
  if (detailDataLen > 0) {
    detailArray.set(featureFrame.detailSlots.subarray(0, detailDataLen));
  }
  if (detailDataLen < detailArray.length) {
    detailArray.fill(0, detailDataLen);
  }
  detailModeBuffer.value.needsUpdate = true;
  if ((uniforms.uChromesthesiaMix?.value ?? 0) > 0) {
    const detailColorArray = detailColorBuffer.value.array;
    const dcDataLen = featureFrame?.detailColorSlots?.length
      ? Math.min(featureFrame.detailColorSlots.length, detailColorArray.length)
      : 0;
    if (dcDataLen > 0) {
      detailColorArray.set(
        featureFrame.detailColorSlots.subarray(0, dcDataLen),
      );
    }
    if (dcDataLen < detailColorArray.length) {
      detailColorArray.fill(0, dcDataLen);
    }
    detailColorBuffer.value.needsUpdate = true;
  }

  const backboneModeCount = countActiveModes(featureFrame?.backboneSlots);
  const detailModeCount = countActiveModes(featureFrame?.detailSlots);
  setIfChanged(uniforms.uBackboneModeCount, backboneModeCount);
  setIfChanged(uniforms.uDetailModeCount, detailModeCount);
  setIfChanged(uniforms.uActiveModeCount, backboneModeCount + detailModeCount);
  setIfChanged(uniforms.uAverageAmplitude, featureFrame?.averageAmplitude ?? 0);
  setIfChanged(uniforms.uTransientEnergy, featureFrame?.transientEnergy ?? 0);
  setIfChanged(uniforms.uSpectralCentroid, featureFrame?.spectralCentroid ?? 0);
  setIfChanged(uniforms.uSpectralFlux, featureFrame?.spectralFlux ?? 0);
  setIfChanged(uniforms.uStructureSignal, featureFrame?.structureSignal ?? 0);
  setIfChanged(uniforms.uEnergySignal, featureFrame?.energySignal ?? 0);
  setIfChanged(uniforms.uChangeSignal, featureFrame?.changeSignal ?? 0);
  setIfChanged(uniforms.uPulseSignal, featureFrame?.pulseSignal ?? 0);
  setIfChanged(uniforms.uHarmonicity, featureFrame?.harmonicity ?? 0);
  setIfChanged(uniforms.uBassSalience, featureFrame?.bassSalience ?? 0);
  setIfChanged(uniforms.uTextureSpread, featureFrame?.textureSpread ?? 0);
  setIfChanged(uniforms.uNovelty, featureFrame?.novelty ?? 0);
  const beatTarget =
    featureFrame?.beatDetected && (featureFrame?.beatStrength ?? 0) > 0.3
      ? clamp01(
          (featureFrame.beatStrength ?? 0) * 0.8 +
            (featureFrame.beatConfidence ?? 0) * 0.2,
        )
      : 0;
  runtimeState.beatPulseEnvelope = damp(
    runtimeState.beatPulseEnvelope ?? 0,
    beatTarget,
    beatTarget > (runtimeState.beatPulseEnvelope ?? 0) ? 25 : 6,
    deltaTime,
  );
  setIfChanged(uniforms.uBeatPulse, runtimeState.beatPulseEnvelope);
  setIfChanged(uniforms.uBeatPhase, featureFrame?.beatPhase ?? 0);
  setIfChanged(
    uniforms.uTempoNorm,
    clamp01(((featureFrame?.estimatedTempo ?? 0) - 40) / 200),
  );
  setIfChanged(uniforms.uRhythmicDensity, featureFrame?.rhythmicDensity ?? 0);

  // Key tonic hue — EMA with circular shortest-path wrapping
  const rawKeyHue = featureFrame?.keyTonicHue ?? runtimeState.keyHue;
  const keyConf = featureFrame?.keyConfidence ?? 0;
  if (keyConf > 0.35) {
    let hueDelta = rawKeyHue - runtimeState.keyHue;
    if (hueDelta > 0.5) hueDelta -= 1;
    if (hueDelta < -0.5) hueDelta += 1;
    runtimeState.keyHue = (runtimeState.keyHue + hueDelta * 0.01 + 1) % 1;
  }
  runtimeState.keyModeSmooth = damp(
    runtimeState.keyModeSmooth,
    featureFrame?.keyMode === "minor" ? 1 : 0,
    2.0,
    deltaTime,
  );
  uniforms.uKeyTint.value.setHSL(runtimeState.keyHue, 0.68, 0.6);
  setIfChanged(uniforms.uKeyTintStrength, clamp01(keyConf * 1.4));
  setIfChanged(uniforms.uKeyMode, runtimeState.keyModeSmooth);

  updateLaserResponse(runtimeState, featureFrame);
  uniforms.uDensityGain.value =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.scaleSignal ?? 0) * DENSITY_RESPONSE_AMOUNT);
  uniforms.uDensityAbsorption.value =
    uniforms.uDensityGain.value * uniforms.uAbsorption.value;
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

  // Keep the orb primarily self-emissive, but retain a very weak symmetric fill
  // rig so the volume stays readable across backends that expect direct lights.
  const primaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  primaryLight.position.set(radius * 1.15, radius * 0.85, radius * 1.8);
  primaryLight.castShadow = false;
  root.add(primaryLight);

  const secondaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  secondaryLight.position.set(-radius * 1.15, radius * 0.85, radius * 1.8);
  secondaryLight.castShadow = false;
  root.add(secondaryLight);

  return {
    root,
    visualRoot,
    sceneLighting: {
      primary: primaryLight,
      secondary: secondaryLight,
    },
  };
}
