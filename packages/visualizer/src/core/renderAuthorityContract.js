import { FIELD_STATES } from "./fieldState.js";

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
