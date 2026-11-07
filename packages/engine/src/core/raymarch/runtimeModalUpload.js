/** Upload the complete audio-owned v3 observation to its one GPU resource owner. */
export function applyRaymarchModelUpload({ runtimeState, featureFrame }) {
  const result = runtimeState.fieldSource.upload(featureFrame);
  if (result.accepted) runtimeState.uploadedFeatureFrame = featureFrame;
  return result;
}
