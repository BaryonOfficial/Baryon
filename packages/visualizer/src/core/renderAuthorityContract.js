import { FIELD_STATES } from "./fieldState.js";

function hasLedgerData(featureFrame) {
  return (
    featureFrame?.energyLedger != null ||
    Number.isFinite(featureFrame?.projectedRenderEnergy)
  );
}

function hasLedgerAuthority(featureFrame) {
  if (featureFrame?.energyLedger?.injectTestTone === true) {
    return true;
  }

  const projectedRenderEnergy =
    featureFrame?.energyLedger?.projectedRenderEnergy ??
    featureFrame?.projectedRenderEnergy;
  const renderEnergyEpsilon =
    featureFrame?.energyLedger?.renderEnergyEpsilon ?? 1e-6;

  return (
    Number.isFinite(projectedRenderEnergy) &&
    projectedRenderEnergy > renderEnergyEpsilon
  );
}

export function hasRenderAuthority(featureFrame) {
  if (!featureFrame) {
    return false;
  }

  if (hasLedgerData(featureFrame)) {
    return hasLedgerAuthority(featureFrame);
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

  return false;
}

export function allowsAudioMotion(featureFrame) {
  return hasRenderAuthority(featureFrame);
}

export function allowsCachedLiveFeatureFrame(featureFrame) {
  if (!hasRenderAuthority(featureFrame)) {
    return false;
  }

  if (featureFrame?.debug?.lineFeedProgramActive === false) {
    return false;
  }

  return true;
}
