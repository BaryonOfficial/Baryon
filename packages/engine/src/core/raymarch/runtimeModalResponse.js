import { clamp01 } from "../../utils/math.js";

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// modalResponseEnergy is raw oscillator energy. Real feature frames also
// publish render-gated response terms; once any render-gated term exists it is
// the sole authority so mute/cut suppression cannot be defeated by raw energy.
function readModalResponseEnergy(featureFrame) {
  const hasRenderGatedEnergy =
    featureFrame?.modalResponseRenderEnergy !== undefined ||
    featureFrame?.modalResponseRenderSourceCoupledEnergy !== undefined ||
    featureFrame?.modalResponseRenderResonantEnergy !== undefined ||
    featureFrame?.debug?.modalResponseRenderEnergy !== undefined;

  if (hasRenderGatedEnergy) {
    return clamp01(
      Math.max(
        readFiniteNumber(featureFrame?.modalResponseRenderEnergy, 0),
        readFiniteNumber(featureFrame?.modalResponseRenderSourceCoupledEnergy, 0),
        readFiniteNumber(featureFrame?.modalResponseRenderResonantEnergy, 0),
        readFiniteNumber(featureFrame?.debug?.modalResponseRenderEnergy, 0),
      ),
    );
  }

  return clamp01(
    Math.max(
      readFiniteNumber(featureFrame?.modalResponseEnergy, 0),
      readFiniteNumber(featureFrame?.debug?.modalResponseEnergy, 0),
    ),
  );
}

export function readRuntimeModalResponseEnergy(_runtimeState, featureFrame) {
  return readModalResponseEnergy(featureFrame);
}
