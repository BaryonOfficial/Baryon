import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  isAudioFeatureTopologyPacket,
  isAudioFeatureObservationPacket,
  createRendererFeatureView,
} from "../../contracts/audioFeatureProtocol.js";

export { createRendererFeatureView } from "../../contracts/audioFeatureProtocol.js";

/**
 * The static full eligible basis. Signed source overlap is serialized once;
 * no phase locks, source-frequency selection or display-slot estimates exist.
 * Arrays belong to this packet; the producer retains its own acoustic state.
 */
export function buildTopologyPacket({
  configuration,
  workerGeneration,
  topologyRevision,
  families,
  shells,
  boundaryMode,
  exposureSeconds,
  spectrum,
}) {
  if (!Array.isArray(families) || !Array.isArray(shells))
    throw new TypeError(
      "v3 topology requires complete family and shell arrays",
    );
  const topology = {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: configuration.sourceGeneration,
    workerGeneration,
    timelineRevision: configuration.timelineRevision,
    processingRevision: configuration.processingRevision,
    topologyRevision,
    basisConvention: "rectangular-permutation-v1",
    boundaryMode,
    sampleRate: configuration.sampleRate,
    channelCount: configuration.channelCount,
    exposureSeconds,
    familyCount: families.length,
    shellCount: shells.length,
    familyIndices: Uint16Array.from(
      families.flatMap(({ u, v, w }) => [u, v, w]),
    ),
    familyShells: Uint16Array.from(families, (family) => family.shellIndex),
    sourceOverlaps: Float64Array.from(
      families,
      (family) => family.sourceAmplitudeOverlap,
    ),
    naturalFrequenciesHz: Float64Array.from(
      shells,
      (shell) => shell.naturalFrequencyHz,
    ),
    qualityFactors: Float64Array.from(shells, (shell) => shell.qualityFactor),
    spectrum: {
      representation: spectrum.representation,
      frameSize: spectrum.frameSize,
      hopSize: spectrum.hopSize,
      transitions: spectrum.transitions.slice(),
    },
  };
  // Validate numbers before integer conversion can disguise a bad identity.
  if (
    families.some(
      (f) =>
        ![f.u, f.v, f.w, f.shellIndex].every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= 65535,
        ),
    ) ||
    !isAudioFeatureTopologyPacket(topology)
  )
    throw new TypeError("Invalid v3 topology packet");
  return Object.freeze(topology);
}

/**
 * Accepted, prepared sample time is relative to this acoustic generation.
 * The capture cursor may rebase during pause; processedFrames is the once-only
 * accepted input count. Preparation delay is represented exactly once.
 */
export function buildObservationPacket({
  topology,
  snapshot,
  frameId,
  startSample,
}) {
  const response = snapshot.response;
  if (!response || response.sampleIndex === 0) return null;
  const { pressure, velocity, pressureMoments, velocityMoments } = response;
  let normalizationEnergy = 0;
  for (let i = 0; i < topology.familyCount; i++) {
    const diagonal = topology.familyShells[i] * (topology.shellCount + 1);
    normalizationEnergy +=
      topology.sourceOverlaps[i] ** 2 *
      (pressureMoments[diagonal] + velocityMoments[diagonal]);
  }
  const observation = {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: snapshot.sourceGeneration,
    workerGeneration: topology.workerGeneration,
    timelineRevision: snapshot.timelineRevision,
    processingRevision: snapshot.processingRevision,
    topologyRevision: topology.topologyRevision,
    frameId,
    startSample,
    endSample: response.sampleIndex,
    inputEndSample: snapshot.processedFrames,
    preparationDelayFrames: snapshot.preparation.delayFrames,
    sourcePhase: snapshot.phase,
    pressure,
    velocity,
    pressureMoments,
    velocityMoments,
    normalizationEnergy,
    spectrum: {
      frameEndSample: response.spectral.frameEndSample,
      inputSpectrum: response.spectral.inputSpectrum,
      boundaryDelta: response.spectral.boundaryDelta,
    },
  };
  if (!isAudioFeatureObservationPacket(observation))
    throw new TypeError("Invalid v3 observation packet");
  return Object.freeze(observation);
}

export function restoreTransportedRendererFeatureViewOwnership(featureFrame) {
  if (!featureFrame) return null;
  const view = createRendererFeatureView({
    topology: featureFrame.topology,
    observation: featureFrame.observation,
  });
  return featureFrame.renderAuthority === false
    ? Object.freeze({ ...view, renderAuthority: false })
    : view;
}
