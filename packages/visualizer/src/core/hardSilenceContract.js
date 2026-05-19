import { FIELD_STATES, isFieldDrivenState } from "./fieldState.js";

export function isZeroInputHardSilence(featureFrame) {
  return (
    featureFrame?.liveInputHardSilenceActive === true ||
    featureFrame?.debug?.liveInputHardSilenceActive === true
  );
}

export function allowsSourceForcing(featureFrame, status) {
  if (isZeroInputHardSilence(featureFrame)) {
    return false;
  }

  return Boolean(
    status?.isPlaying ||
    status?.isLiveInputActive ||
    featureFrame?.fieldState === FIELD_STATES.test,
  );
}

export function allowsAudioMotion(featureFrame, status) {
  return (
    allowsSourceForcing(featureFrame, status) &&
    isFieldDrivenState(featureFrame?.fieldState)
  );
}

export function allowsPresentationResponse(featureFrame) {
  return !isZeroInputHardSilence(featureFrame);
}
