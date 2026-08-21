import { isRenderAuthorityFrame } from "../contracts/audioFeatureProtocol.js";

function hasLedgerData(featureFrame) {
  return featureFrame?.energyLedger != null;
}

function hasLedgerAuthority(featureFrame) {
  if (featureFrame?.energyLedger?.injectTestTone === true) {
    return true;
  }

  const projectedRenderEnergy =
    featureFrame?.energyLedger?.projectedRenderEnergy;
  const renderEnergyEpsilon = featureFrame?.energyLedger?.renderEnergyEpsilon;

  return (
    Number.isFinite(projectedRenderEnergy) &&
    projectedRenderEnergy >
      (Number.isFinite(renderEnergyEpsilon) ? renderEnergyEpsilon : 1e-6)
  );
}

function hasCurrentLiveSourceEvidence(featureFrame) {
  return (
    featureFrame?.sourceEvidence?.currentSourceEvidence === true &&
    featureFrame?.sourceEvidence?.sourceBoundaryState === "live"
  );
}

function hasPreparedFileEvidence(featureFrame) {
  const evidence = featureFrame?.sourceEvidence;
  return (
    evidence?.sourceKind === "file" &&
    evidence?.sourceBoundaryState === "prepared" &&
    evidence?.currentSourceEvidence === false &&
    evidence?.transport?.preparationOnly === true &&
    evidence?.transport?.playing === false
  );
}

export function allowsModalDescriptorRenderAuthority(featureFrame) {
  if (!isRenderAuthorityFrame(featureFrame)) {
    return false;
  }
  const fieldAuthority = featureFrame?.modalDescriptor?.fieldAuthority;
  return (
    fieldAuthority == null ||
    fieldAuthority === "complete" ||
    fieldAuthority === "capacity-limited"
  );
}

export function hasRenderAuthority(featureFrame) {
  if (!isRenderAuthorityFrame(featureFrame)) {
    return false;
  }

  if (hasPreparedFileEvidence(featureFrame)) {
    return false;
  }

  return (
    hasLedgerAuthority(featureFrame) &&
    allowsModalDescriptorRenderAuthority(featureFrame)
  );
}

export function hasPreparationAuthority(featureFrame) {
  if (!isRenderAuthorityFrame(featureFrame)) {
    return false;
  }

  return (
    hasPreparedFileEvidence(featureFrame) &&
    hasLedgerAuthority(featureFrame) &&
    allowsModalDescriptorRenderAuthority(featureFrame)
  );
}

export function allowsAudioMotion(featureFrame) {
  if (!isRenderAuthorityFrame(featureFrame)) {
    return false;
  }
  return (
    featureFrame?.audioMotionAuthority !== false &&
    hasRenderAuthority(featureFrame)
  );
}

export function allowsCurrentLiveRenderFrame(featureFrame) {
  if (!isRenderAuthorityFrame(featureFrame)) {
    return false;
  }
  return (
    hasLedgerData(featureFrame) &&
    hasRenderAuthority(featureFrame) &&
    hasCurrentLiveSourceEvidence(featureFrame)
  );
}
