import { isRendererFeatureUploadContract } from "../contracts/audioFeatureProtocol.js";

// Authority belongs to a complete matching model and its explicit session flag.
// Raw energy controls optical brightness; it cannot invalidate quiet geometry.
export function hasRenderAuthority(frame) {
  return (
    isRendererFeatureUploadContract(frame) && frame.renderAuthority === true
  );
}
export function allowsAudioMotion(frame) {
  return hasRenderAuthority(frame) && frame.audioMotionAuthority === true;
}
