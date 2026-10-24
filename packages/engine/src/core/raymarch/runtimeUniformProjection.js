import { clamp } from "../../utils/math.js";

export function setRaymarchUniformIfChanged(node, value) {
  if (node && node.value !== value) node.value = value;
}
function syncMaterial(runtimeState, enabled) {
  const bloom = runtimeState.bloomTuning;
  if (bloom) {
    bloom.effectiveStrength = bloom.baseStrength;
    bloom.effectiveRadius = Math.max(0, bloom.baseRadius);
    bloom.effectiveThreshold = clamp(bloom.baseThreshold, 0, 1);
    bloom.bloomAllowed = enabled;
  }
  setRaymarchUniformIfChanged(
    runtimeState.uniforms.uDensityGain,
    runtimeState.baseDensityGain ?? runtimeState.uniforms.uDensityGain.value,
  );
}
export function clearRaymarchUniformProjection(runtimeState) {
  syncMaterial(runtimeState, false);
}
export function syncRaymarchUniformProjection(runtimeState) {
  syncMaterial(runtimeState, true);
}
