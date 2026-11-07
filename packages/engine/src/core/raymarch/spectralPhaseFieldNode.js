import { abs, atan, cos, dot, float, length, max, sin, vec2 } from "three/tsl";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";

/** Advance unit hue directions once per observer step, never per ray sample. */
export function advanceSpectralDirectionNode(prior, evidence, assimilation) {
  const epsilon = float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon);
  const cross = prior.x.mul(evidence.y).sub(prior.y.mul(evidence.x));
  const agreement = dot(prior, evidence);
  // The CPU resolver uses the same deterministic positive half-turn tie.
  const delta = agreement
    .lessThan(0)
    .and(abs(cross).lessThanEqual(epsilon))
    .select(float(Math.PI), atan(cross, agreement));
  const rotation = delta.mul(assimilation).toVar();
  const cosine = cos(rotation),
    sine = sin(rotation);
  const direction = vec2(
    prior.x.mul(cosine).sub(prior.y.mul(sine)),
    prior.x.mul(sine).add(prior.y.mul(cosine)),
  ).toVar();
  return rotation
    .equal(0)
    .select(prior, direction.div(max(length(direction), epsilon)));
}
