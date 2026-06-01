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

export function hasRenderAuthority(featureFrame) {
  if (!featureFrame) {
    return false;
  }

  return hasLedgerData(featureFrame) && hasLedgerAuthority(featureFrame);
}

export function allowsAudioMotion(featureFrame) {
  return (
    featureFrame?.audioMotionAuthority !== false &&
    hasRenderAuthority(featureFrame)
  );
}

export function allowsCurrentLiveRenderFrame(featureFrame) {
  return (
    hasLedgerData(featureFrame) &&
    hasRenderAuthority(featureFrame) &&
    hasCurrentLiveSourceEvidence(featureFrame)
  );
}
