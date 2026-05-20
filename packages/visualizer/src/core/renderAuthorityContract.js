import { FIELD_STATES } from "./fieldState.js";

const RENDER_AUTHORITY_EPSILON = 1e-6;

function hasPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > RENDER_AUTHORITY_EPSILON;
}

function hasPositiveSlotAmplitude(slots) {
  if (!(slots instanceof Float32Array) || slots.length === 0) {
    return false;
  }

  for (let index = 3; index < slots.length; index += 4) {
    if (hasPositiveFiniteNumber(slots[index])) {
      return true;
    }
  }

  return false;
}

function readActiveModeCount(featureFrame) {
  const explicitCount = featureFrame?.activeModeCount;
  if (Number.isFinite(explicitCount)) {
    return explicitCount;
  }

  return (
    (featureFrame?.activeBackboneModeCount ?? 0) +
    (featureFrame?.activeDetailModeCount ?? 0)
  );
}

export function isRenderAuthorityCut(featureFrame) {
  return featureFrame?.renderAuthorityCut === true;
}

export function hasRenderAuthority(featureFrame) {
  if (!featureFrame || isRenderAuthorityCut(featureFrame)) {
    return false;
  }

  if (featureFrame.renderAuthority === false) {
    return false;
  }

  if (featureFrame.renderAuthority === true) {
    return true;
  }

  if (featureFrame.fieldState === FIELD_STATES.test) {
    return true;
  }

  return (
    featureFrame.hasModalField === true ||
    readActiveModeCount(featureFrame) > 0 ||
    hasPositiveFiniteNumber(featureFrame.modalCoefficientEnergy) ||
    hasPositiveFiniteNumber(featureFrame.modalResponseRenderEnergy) ||
    hasPositiveFiniteNumber(featureFrame.observationEnergy) ||
    hasPositiveFiniteNumber(featureFrame.modalVisibilityEnergy) ||
    hasPositiveFiniteNumber(featureFrame.modalObserverVisibilityEnergy) ||
    hasPositiveSlotAmplitude(featureFrame.backboneSlots) ||
    hasPositiveSlotAmplitude(featureFrame.detailSlots) ||
    hasPositiveSlotAmplitude(featureFrame.modeSlots)
  );
}

export function allowsAudioMotion(featureFrame) {
  return hasRenderAuthority(featureFrame);
}
