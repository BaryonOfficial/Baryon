// One internal representation. Version 2 phase/frequency-per-mode packets are
// rejected; a modal observation is never reconstructed from those fields.
export const AUDIO_FEATURE_PROTOCOL_VERSION = 3;

/**
 * @typedef {{
 * protocolVersion: number, sourceGeneration: number, workerGeneration: number,
 * timelineRevision: number, processingRevision: number, topologyRevision: number
 * }} PacketRevisions
 * @typedef {PacketRevisions & {
 * basisConvention: "rectangular-permutation-v1", boundaryMode: "neumann" | "dirichlet",
 * sampleRate: number, channelCount: number, exposureSeconds: number,
 * familyCount: number, shellCount: number, familyIndices: Uint16Array,
 * familyShells: Uint16Array, sourceOverlaps: Float64Array,
 * naturalFrequenciesHz: Float64Array, qualityFactors: Float64Array,
 * spectrum: {representation: "finite-response-window-v1", frameSize: number,
 * hopSize: number, transitions: Float64Array}
 * }} AudioFeatureTopologyPacket
 * @typedef {PacketRevisions & {
 * frameId: number, startSample: number, endSample: number, inputEndSample: number,
 * preparationDelayFrames: number, sourcePhase: "running" | "paused" | "draining",
 * pressure: Float64Array, velocity: Float64Array,
 * pressureMoments: Float64Array, velocityMoments: Float64Array,
 * normalizationEnergy: number,
 * spectrum: {frameEndSample: number, inputSpectrum: Float64Array, boundaryDelta: Float64Array}
 * }} AudioFeatureObservationPacket
 * @typedef {{topology: AudioFeatureTopologyPacket, observation: AudioFeatureObservationPacket}} CompleteAudioFeatureModel
 * @typedef {CompleteAudioFeatureModel & {
 * frameId: number, renderAuthority: boolean, audioMotionAuthority: boolean
 * }} RendererFeatureFrame
 */

const REVISION_KEYS = /** @type {const} */ ([
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
  "topologyRevision",
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is number} */
export function isPositiveProtocolInteger(value) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

/** @param {unknown} value @returns {value is number} */
function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

/** @param {Record<string, unknown>} value */
function validRevisions(value) {
  return (
    value.protocolVersion === AUDIO_FEATURE_PROTOCOL_VERSION &&
    isPositiveProtocolInteger(value.sourceGeneration) &&
    isPositiveProtocolInteger(value.workerGeneration) &&
    nonnegativeInteger(value.timelineRevision) &&
    nonnegativeInteger(value.processingRevision) &&
    isPositiveProtocolInteger(value.topologyRevision)
  );
}

/** @param {unknown} value @param {number} length @returns {value is Float64Array} */
function floats(value, length) {
  return (
    value instanceof Float64Array &&
    value.length === length &&
    value.every(Number.isFinite)
  );
}

/**
 * Relative PSD check on raw amplitude-squared moments. Scaling by the largest
 * diagonal preserves gain invariance, including quiet input. The 1e-8 relative
 * allowance covers bounded-conditioned moment reconstruction; values are never
 * clamped, normalized in place or repaired. Signed color forms do not use this.
 * @param {Float64Array} matrix @param {number} count
 */
function symmetricPositiveSemidefinite(matrix, count) {
  let scale = 0;
  for (let i = 0; i < count; i++) {
    scale = Math.max(scale, Math.abs(matrix[i * count + i]));
    for (let j = 0; j < i; j++)
      if (matrix[i * count + j] !== matrix[j * count + i]) return false;
  }
  if (scale === 0) return matrix.every((value) => value === 0);
  const work = new Float64Array(matrix.length);
  for (let i = 0; i < matrix.length; i++) work[i] = matrix[i] / scale;
  const tolerance = 1e-8;
  for (let k = 0; k < count; k++) {
    let pivot = k;
    for (let i = k + 1; i < count; i++)
      if (work[i * count + i] > work[pivot * count + pivot]) pivot = i;
    if (pivot !== k) {
      for (let i = 0; i < count; i++) {
        const previous = work[k * count + i];
        work[k * count + i] = work[pivot * count + i];
        work[pivot * count + i] = previous;
      }
      for (let i = 0; i < count; i++) {
        const previous = work[i * count + k];
        work[i * count + k] = work[i * count + pivot];
        work[i * count + pivot] = previous;
      }
    }
    const diagonal = work[k * count + k];
    if (diagonal < -tolerance) return false;
    if (diagonal <= tolerance) {
      for (let i = k; i < count; i++)
        for (let j = k; j < count; j++)
          if (Math.abs(work[i * count + j]) > tolerance) return false;
      return true;
    }
    for (let i = k + 1; i < count; i++)
      for (let j = i; j < count; j++) {
        const value =
          work[i * count + j] -
          (work[i * count + k] * work[j * count + k]) / diagonal;
        work[i * count + j] = work[j * count + i] = value;
      }
  }
  return true;
}

/** @param {unknown} value @returns {value is AudioFeatureTopologyPacket} */
export function isAudioFeatureTopologyPacket(value) {
  if (
    !isRecord(value) ||
    !validRevisions(value) ||
    value.basisConvention !== "rectangular-permutation-v1" ||
    !["neumann", "dirichlet"].includes(String(value.boundaryMode)) ||
    !Number.isFinite(value.sampleRate) ||
    Number(value.sampleRate) <= 0 ||
    ![1, 2].includes(Number(value.channelCount)) ||
    typeof value.channelCount !== "number" ||
    !Number.isFinite(value.exposureSeconds) ||
    Number(value.exposureSeconds) < 1 / Number(value.sampleRate) ||
    !isPositiveProtocolInteger(value.familyCount) ||
    value.familyCount > 65535 ||
    !isPositiveProtocolInteger(value.shellCount) ||
    value.shellCount > value.familyCount ||
    !(value.familyIndices instanceof Uint16Array) ||
    value.familyIndices.length !== 3 * value.familyCount ||
    !(value.familyShells instanceof Uint16Array) ||
    value.familyShells.length !== value.familyCount ||
    !floats(value.sourceOverlaps, value.familyCount) ||
    !floats(value.naturalFrequenciesHz, value.shellCount) ||
    !floats(value.qualityFactors, value.shellCount) ||
    !isRecord(value.spectrum)
  )
    return false;
  const { spectrum } = value;
  if (
    spectrum.representation !== "finite-response-window-v1" ||
    !isPositiveProtocolInteger(spectrum.frameSize) ||
    spectrum.frameSize < 8 ||
    !Number.isInteger(Math.log2(spectrum.frameSize)) ||
    !isPositiveProtocolInteger(spectrum.hopSize) ||
    spectrum.frameSize % spectrum.hopSize !== 0 ||
    !floats(spectrum.transitions, 6 * value.shellCount)
  )
    return false;
  const identities = new Set();
  const shells = new Set();
  for (let i = 0; i < value.familyCount; i++) {
    const [u, v, w] = value.familyIndices.subarray(3 * i, 3 * i + 3);
    if (
      u > v ||
      v > w ||
      w === 0 ||
      (value.boundaryMode === "dirichlet"
        ? [u, v, w].some((n) => n < 1 || n % 2 !== 1)
        : [u, v, w].some((n) => n % 2 !== 0)) ||
      value.familyShells[i] >= value.shellCount
    )
      return false;
    const key = `${u},${v},${w}`;
    if (identities.has(key)) return false;
    identities.add(key);
    shells.add(value.familyShells[i]);
  }
  if (shells.size !== value.shellCount) return false;
  for (let i = 0; i < value.shellCount; i++) {
    if (
      value.naturalFrequenciesHz[i] <= 0 ||
      value.naturalFrequenciesHz[i] > Number(value.sampleRate) / 2 ||
      value.qualityFactors[i] < 0.5
    )
      return false;
    const [a, b, c, d] = spectrum.transitions.subarray(6 * i, 6 * i + 4);
    const determinant = a * d - b * c;
    if (
      !(
        determinant > 0 &&
        determinant < 1 &&
        (1 - a) * (1 - d) - b * c > 0 &&
        (1 + a) * (1 + d) - b * c > 0
      )
    )
      return false;
  }
  return true;
}

/** @param {unknown} value @returns {value is AudioFeatureObservationPacket} */
export function isAudioFeatureObservationPacket(value) {
  if (
    !isRecord(value) ||
    !validRevisions(value) ||
    !isPositiveProtocolInteger(value.frameId) ||
    !nonnegativeInteger(value.startSample) ||
    !nonnegativeInteger(value.endSample) ||
    value.startSample > value.endSample ||
    !nonnegativeInteger(value.inputEndSample) ||
    !nonnegativeInteger(value.preparationDelayFrames) ||
    value.inputEndSample - value.endSample !== value.preparationDelayFrames ||
    !["running", "paused", "draining"].includes(String(value.sourcePhase)) ||
    !Number.isFinite(value.normalizationEnergy) ||
    Number(value.normalizationEnergy) < 0 ||
    !(value.pressureMoments instanceof Float64Array) ||
    !isRecord(value.spectrum)
  )
    return false;
  const count = Math.sqrt(value.pressureMoments.length);
  if (
    !isPositiveProtocolInteger(count) ||
    !floats(value.pressureMoments, count * count) ||
    !floats(value.velocityMoments, count * count) ||
    !(value.pressure instanceof Float64Array)
  )
    return false;
  const channels = value.pressure.length / count;
  if (
    ![1, 2].includes(channels) ||
    !floats(value.pressure, count * channels) ||
    !floats(value.velocity, count * channels) ||
    !symmetricPositiveSemidefinite(value.pressureMoments, count) ||
    !symmetricPositiveSemidefinite(value.velocityMoments, count)
  )
    return false;
  const spectrum = value.spectrum;
  return (
    nonnegativeInteger(spectrum.frameEndSample) &&
    spectrum.frameEndSample <= value.endSample &&
    spectrum.inputSpectrum instanceof Float64Array &&
    spectrum.inputSpectrum.length > 0 &&
    spectrum.inputSpectrum.length % (2 * channels) === 0 &&
    spectrum.inputSpectrum.every(Number.isFinite) &&
    floats(spectrum.boundaryDelta, 2 * count * channels)
  );
}

/** @param {unknown} observation @param {unknown} topology */
export function audioFeatureObservationMatchesTopology(observation, topology) {
  if (
    !isAudioFeatureObservationPacket(observation) ||
    !isAudioFeatureTopologyPacket(topology) ||
    REVISION_KEYS.some((key) => observation[key] !== topology[key]) ||
    observation.pressure.length !==
      topology.shellCount * topology.channelCount ||
    observation.pressureMoments.length !== topology.shellCount ** 2 ||
    observation.spectrum.inputSpectrum.length !==
      2 * topology.channelCount * (topology.spectrum.frameSize / 2 + 1) ||
    observation.spectrum.frameEndSample % topology.spectrum.hopSize !== 0 ||
    observation.endSample - observation.spectrum.frameEndSample >=
      topology.spectrum.hopSize
  )
    return false;
  let normalizationEnergy = 0;
  for (let i = 0; i < topology.familyCount; i++) {
    const diagonal = topology.familyShells[i] * (topology.shellCount + 1);
    normalizationEnergy +=
      topology.sourceOverlaps[i] ** 2 *
      (observation.pressureMoments[diagonal] +
        observation.velocityMoments[diagonal]);
  }
  return (
    Number.isFinite(normalizationEnergy) &&
    normalizationEnergy >= 0 &&
    Math.abs(normalizationEnergy - observation.normalizationEnergy) <=
      1e-12 * Math.max(normalizationEnergy, observation.normalizationEnergy)
  );
}

/** @param {unknown} value @returns {value is CompleteAudioFeatureModel} */
export function isCompleteAudioFeatureModel(value) {
  return (
    isRecord(value) &&
    audioFeatureObservationMatchesTopology(value.observation, value.topology)
  );
}

// Cache/provenance only: neither registry owns acoustic or presentation time.
const rendererViews = new WeakMap();
const validatedRendererViews = new WeakSet();

/**
 * Read-only renderer projection of one validated complete model. Published
 * immutable packet pairs reuse this view; mutable boundary input is revalidated.
 * Neither path can bootstrap a source, normalize again or advance it.
 * @param {unknown} model
 */
export function createRendererFeatureView(model) {
  if (!model) return null;
  if (!isRecord(model))
    throw new TypeError("Invalid complete v3 audio feature model");
  // History/mirror wrappers do not create a new physical observation. Use the
  // immutable packet identity. Mutable boundary objects cannot retain trust.
  const candidateObservation = model.observation;
  const candidateTopology = model.topology;
  const immutablePackets =
    isRecord(candidateTopology) &&
    isRecord(candidateObservation) &&
    Object.isFrozen(candidateTopology) &&
    Object.isFrozen(candidateObservation);
  const cached = immutablePackets
    ? rendererViews.get(candidateObservation)
    : null;
  if (
    cached &&
    cached.topology === model.topology &&
    cached.observation === model.observation
  )
    return cached;
  if (!isCompleteAudioFeatureModel(model))
    throw new TypeError("Invalid complete v3 audio feature model");
  const observation = model.observation;
  const view = Object.freeze({
    topology: model.topology,
    observation,
    frameId: observation.frameId,
    sourceGeneration: observation.sourceGeneration,
    workerGeneration: observation.workerGeneration,
    topologyRevision: observation.topologyRevision,
    renderAuthority: true,
    audioMotionAuthority: observation.sourcePhase !== "paused",
  });
  // Published packets are immutable under the source/mirror ownership contract.
  // Only exact factory-owned views use the fast contract check. Transported
  // frames or copies of a view do not inherit that validation provenance.
  if (immutablePackets) {
    rendererViews.set(observation, view);
    validatedRendererViews.add(view);
  }
  return view;
}

/** @param {unknown} value @param {unknown} [topology] @returns {value is RendererFeatureFrame} */
export function isRendererFeatureUploadContract(value, topology = undefined) {
  if (!isRecord(value)) return false;
  if (validatedRendererViews.has(value))
    return topology === undefined || topology === value.topology;
  const frameId = value.frameId;
  const audioMotionAuthority = value.audioMotionAuthority;
  return (
    typeof value.renderAuthority === "boolean" &&
    typeof value.audioMotionAuthority === "boolean" &&
    isCompleteAudioFeatureModel(value) &&
    frameId === value.observation.frameId &&
    (topology === undefined || topology === value.topology) &&
    audioMotionAuthority === (value.observation.sourcePhase !== "paused")
  );
}

/** @param {unknown} value @param {unknown} [topology] @returns {asserts value is RendererFeatureFrame} */
export function assertRendererFeatureUploadContract(
  value,
  topology = undefined,
) {
  if (!isRendererFeatureUploadContract(value, topology))
    throw new TypeError("Invalid renderer feature upload contract.");
}
