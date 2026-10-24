import { createBroadbandAudioState } from "./broadbandAudioState.js";
import { buildModalExcitationAtlas } from "./modalExcitationAtlas.js";
import {
  buildTopologyPacket,
  buildObservationPacket,
} from "./audioFeaturePacketCodec.js";
import { AUDIO_FEATURE_PROTOCOL_VERSION } from "../../contracts/audioFeatureProtocol.js";

export function createFeatureWorkerState() {
  return {
    acoustic: null,
    topology: null,
    sourceGeneration: 0,
    workerGeneration: 0,
    timelineRevision: 0,
    processingRevision: 0,
    frameId: 0,
    publishedEndSample: 0,
    acceptedBlocks: 0,
    topologyPublishCount: 0,
    observationPublishCount: 0,
  };
}

export function initializeFeatureWorker(state, payload) {
  if (payload.protocolVersion !== AUDIO_FEATURE_PROTOCOL_VERSION)
    throw new TypeError("Unsupported audio feature protocol");
  const configuration = {
    sourceGeneration: payload.sourceGeneration,
    timelineRevision: payload.configuration.timelineRevision,
    processingRevision: payload.configuration.processingRevision,
    sampleRate: payload.configuration.sampleRate,
    channelCount: payload.configuration.channelCount,
    startSample: 0,
  };
  if (state.acoustic) {
    const next = [
      payload.sourceGeneration,
      payload.workerGeneration,
      configuration.timelineRevision,
      configuration.processingRevision,
    ];
    const previous = [
      state.sourceGeneration,
      state.workerGeneration,
      state.timelineRevision,
      state.processingRevision,
    ];
    const changed = next.findIndex((n, i) => n !== previous[i]);
    if (changed < 0) return null;
    if (next[changed] < previous[changed]) return null;
  }
  const { boundaryMode, cavityAcousticScale } = payload.configuration;
  const exposureSeconds = payload.configuration.exposureSeconds ?? 0.05;
  const atlas = buildModalExcitationAtlas({
    radius: 1,
    boundaryMode,
    cavityAcousticScale,
  });
  const shells = [
    ...new Map(
      atlas.map((family) => [family.responseModeKey, family]),
    ).values(),
  ];
  const indices = new Map(shells.map((shell, i) => [shell.responseModeKey, i]));
  const families = atlas.map((family) => ({
    u: family.u,
    v: family.v,
    w: family.w,
    shellIndex: indices.get(family.responseModeKey),
    sourceAmplitudeOverlap:
      family.sourceCouplingAmplitude * family.sourceProjectionWeight,
  }));
  const acoustic = createBroadbandAudioState({
    configuration,
    shells,
    exposureSeconds,
    cavityAcousticScale,
  });
  const topology = buildTopologyPacket({
    configuration,
    workerGeneration: payload.workerGeneration,
    topologyRevision: 1,
    families,
    shells,
    boundaryMode,
    exposureSeconds,
    spectrum: acoustic.read().response.spectral,
  });
  Object.assign(state, {
    acoustic,
    topology,
    ...configuration,
    workerGeneration: payload.workerGeneration,
    frameId: 0,
    publishedEndSample: 0,
    acceptedBlocks: 0,
    observationPublishCount: 0,
    topologyPublishCount: state.topologyPublishCount + 1,
  });
  return topology;
}

function publishObservation(state) {
  const snapshot = state.acoustic.read();
  const packet = buildObservationPacket({
    topology: state.topology,
    snapshot,
    frameId: state.frameId + 1,
    startSample: state.publishedEndSample,
  });
  if (!packet) return null;
  state.frameId++;
  state.publishedEndSample = packet.endSample;
  state.observationPublishCount++;
  return packet;
}

export function processFeatureWorkerPcm(state, packet) {
  if (
    !state.acoustic ||
    packet.protocolVersion !== AUDIO_FEATURE_PROTOCOL_VERSION ||
    packet.workerGeneration !== state.workerGeneration
  )
    return {
      accepted: false,
      reason: "generation-mismatch",
      observation: null,
    };
  if (
    ["sourceGeneration", "timelineRevision", "processingRevision"].some(
      (key) => packet[key] !== state[key],
    )
  )
    return {
      accepted: false,
      reason: "generation-mismatch",
      observation: null,
    };
  try {
    if (
      !Number.isSafeInteger(packet.frameCount) ||
      packet.frameCount < 1 ||
      packet.frameCount > 512 ||
      !Array.isArray(packet.buffers) ||
      packet.buffers.length !== state.topology.channelCount ||
      new Set(packet.buffers).size !== packet.buffers.length ||
      packet.buffers.some(
        (buffer) =>
          !(buffer instanceof ArrayBuffer) || buffer.byteLength !== 2048,
      )
    )
      throw new TypeError("Invalid PCM loan layout");
    const channels = packet.buffers.map(
      (buffer) => new Float32Array(buffer, 0, packet.frameCount),
    );
    const accepted = state.acoustic.accept({ ...packet, channels });
    if (!accepted.accepted) return { ...accepted, observation: null };
    state.acceptedBlocks++;
    const snapshot = state.acoustic.read();
    if (
      !snapshot.response ||
      snapshot.response.sampleIndex <= state.publishedEndSample
    )
      return { ...accepted, observation: null };
    // These arrays belong to the read, not the live solver. Transferring a
    // publication cannot detach state needed by the following PCM interval.
    const observation = buildObservationPacket({
      topology: state.topology,
      snapshot,
      frameId: state.frameId + 1,
      startSample: state.publishedEndSample,
    });
    state.frameId++;
    state.publishedEndSample = observation.endSample;
    state.observationPublishCount++;
    return { ...accepted, observation };
  } catch (error) {
    state.acoustic.invalidate("processing-failed");
    throw error;
  }
}

export function processFeatureWorkerLifecycle(state, event) {
  if (
    !state.acoustic ||
    [
      "sourceGeneration",
      "workerGeneration",
      "timelineRevision",
      "processingRevision",
    ].some((key) => event[key] !== state[key])
  )
    return null;
  if (event.type === "paused") {
    state.acoustic.pause();
    return publishObservation(state);
  }
  if (event.type === "resumed") state.acoustic.resume(event);
  else if (event.type === "ended") {
    const result = state.acoustic.end(event);
    if (!result.accepted) throw new Error(result.reason);
    return publishObservation(state);
  } else if (event.type === "fault") state.acoustic.invalidate(event.reason);
  else throw new TypeError("Unsupported v3 audio feature event");
  return null;
}

function transfers(observation) {
  return [
    observation.pressure,
    observation.velocity,
    observation.pressureMoments,
    observation.velocityMoments,
    observation.spectrum.inputSpectrum,
    observation.spectrum.boundaryDelta,
  ].map((array) => array.buffer);
}

/** One initialized worker consumes one ordered, session-owned PCM port. */
export function installFeatureWorkerHost(host) {
  const state = createFeatureWorkerState();
  let pcmPort = null;
  function failure(error) {
    state.acoustic?.invalidate("processing-failed");
    host.postMessage({
      type: "status",
      status: {
        sourceGeneration: state.sourceGeneration,
        workerGeneration: state.workerGeneration,
        state: "failed",
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
  function consume({ data }) {
    let accepted = null,
      observation = null;
    const started = performance.now();
    try {
      if (data.type === "pcm") {
        ({ observation, ...accepted } = processFeatureWorkerPcm(state, data));
        if (!accepted.accepted) failure(accepted.reason ?? "pcm-rejected");
      } else if (data.type !== "started") {
        observation = processFeatureWorkerLifecycle(state, data);
        if (data.type === "fault") failure(data.reason ?? "capture-fault");
      }
    } catch (error) {
      accepted = { accepted: false, reason: "processing-failed" };
      failure(error);
    } finally {
      if (
        data.type === "pcm" &&
        Array.isArray(data.buffers) &&
        data.buffers.every((buffer) => buffer instanceof ArrayBuffer) &&
        new Set(data.buffers).size === data.buffers.length
      ) {
        pcmPort.postMessage(
          {
            type: "recycle",
            slot: data.slot,
            sequence: data.sequence,
            accepted,
            buffers: data.buffers,
          },
          data.buffers,
        );
      }
    }
    if (observation)
      host.postMessage(
        {
          type: "observation-packet",
          packet: observation,
          processingMs: performance.now() - started,
        },
        { transfer: transfers(observation) },
      );
  }
  host.addEventListener("message", ({ data }) => {
    try {
      if (data.type === "init") {
        if (pcmPort)
          throw new Error("Connected PCM epoch cannot be reinitialized");
        const topology = initializeFeatureWorker(state, data);
        if (topology)
          host.postMessage({ type: "topology-packet", packet: topology });
      } else if (data.type === "connect-pcm") {
        if (
          !state.acoustic ||
          pcmPort ||
          !data.port ||
          [
            "sourceGeneration",
            "workerGeneration",
            "timelineRevision",
            "processingRevision",
          ].some((key) => data[key] !== state[key])
        )
          throw new Error("Invalid PCM port connection");
        pcmPort = data.port;
        pcmPort.onmessage = consume;
        pcmPort.onmessageerror = () => failure("pcm-message-error");
        pcmPort.start();
      } else throw new Error("Worker input requires the ordered PCM port");
    } catch (error) {
      failure(error);
    }
  });
  return state;
}

if (
  typeof self !== "undefined" &&
  typeof document === "undefined" &&
  typeof self.addEventListener === "function"
)
  installFeatureWorkerHost(self);
