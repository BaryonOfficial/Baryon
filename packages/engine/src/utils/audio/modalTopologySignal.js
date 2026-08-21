import { hasAgedObservedLayerModes } from "./modalObservedState.js";
import { clamp01, smoothstep } from "../math.js";

function deriveResonantTopologySignal({
  modalObserverMetrics,
  resonantModesAged,
  resonantObserverProfile,
}) {
  const observationConfidence = clamp01(
    modalObserverMetrics.resonantObservationConfidence ?? 0,
  );
  const ringSupport = clamp01(modalObserverMetrics.resonantRingSupport ?? 0);
  const observedDrive = clamp01(
    modalObserverMetrics.resonantObservedDrive ?? 0,
  );
  const observedSnr = clamp01(modalObserverMetrics.resonantObservedSnr ?? 0);
  const observedCoherence = clamp01(
    modalObserverMetrics.resonantObservedCoherence ?? 0,
  );
  const directObservedSupport = Math.max(
    observedDrive * 1.4,
    observedSnr * 0.35,
  );
  const perModeSupported = observedSnr >= 0.55 || observedDrive >= 0.06;
  const confidenceGate = smoothstep(
    resonantObserverProfile.minObservationConfidence,
    resonantObserverProfile.minObservationConfidence * 8,
    observationConfidence,
  );
  const topologySupport = clamp01(
    Math.max(ringSupport, resonantObserverProfile.minRingSupport) *
      confidenceGate *
      directObservedSupport *
      Math.max(0.4, observedCoherence),
  );

  return ringSupport > 0 &&
    modalObserverMetrics.resonantObservedModeCount > 0 &&
    observationConfidence >= resonantObserverProfile.minObservationConfidence &&
    resonantModesAged &&
    perModeSupported
    ? topologySupport
    : 0;
}

export function deriveCurrentResonantTopologySignal({
  state,
  currentFrameAtMs,
  modalObserverMetrics,
  resonantObserverProfile,
}) {
  const resonantModesAged = hasAgedObservedLayerModes({
    modes: state.observedModes,
    layer: "resonant",
    currentFrameAtMs,
    minAgeMs: resonantObserverProfile.authorityMinAgeMs,
  });

  return deriveResonantTopologySignal({
    modalObserverMetrics,
    resonantModesAged,
    resonantObserverProfile,
  });
}
