import { AUDIO_RESPONSE_GAIN } from "../../defaults.js";
import { clamp01 } from "../../utils/math.js";

// Artistic motion reads the already observed raw response. It cannot gate or
// normalize geometry, change modal damping or add another acoustic envelope.
export function updateRaymarchReactiveResponse(
  runtimeState,
  frame,
  _fieldState,
  renderAuthority,
) {
  const energy = renderAuthority ? frame.observation.normalizationEnergy : 0;
  const response = clamp01(Math.sqrt(energy) * AUDIO_RESPONSE_GAIN);
  runtimeState.visualRoot?.scale?.setScalar?.(1);
  runtimeState.responseEnvelope = response;
  runtimeState.motionSignal = response;
  runtimeState.scaleSignal = 0;
  runtimeState.accentEnvelope = 0;
  runtimeState.bloomResponseSignal = response;
}
