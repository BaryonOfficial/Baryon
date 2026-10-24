import { CAVITY_ACOUSTIC_DEFAULTS } from "../defaults.js";
import {
  createFeatureWorkerState,
  initializeFeatureWorker,
  processFeatureWorkerPcm,
} from "../utils/audio/audioFeatureEngine.worker.js";

/** Test fixture from the actual full-basis worker, never invented slot state. */
export function createAudioFeaturePacketFixture(overrides = {}) {
  const configuration = {
    timelineRevision: 0,
    processingRevision: 0,
    sampleRate: 48000,
    channelCount: 2,
    boundaryMode: "neumann",
    exposureSeconds: 0.05,
    cavityAcousticScale: {
      ...CAVITY_ACOUSTIC_DEFAULTS,
      incidentPeakPressurePascalAtFullScale: 0,
    },
    ...overrides.configuration,
  };
  const initialization = {
    protocolVersion: 3,
    sourceGeneration: 1,
    workerGeneration: 1,
    ...overrides,
    configuration,
  };
  const state = createFeatureWorkerState();
  const topology = initializeFeatureWorker(state, initialization);
  let sequence = 0,
    startSample = 0;
  function pcm({ frameCount = 512, postSourceSilence = false } = {}) {
    const channels = Array.from(
      { length: configuration.channelCount },
      (_, channel) => {
        const values = new Float32Array(512);
        if (!postSourceSilence)
          for (let n = 0; n < frameCount; n++)
            values[n] = Math.sin(
              (startSample + n) * (channel === 0 ? 0.017 : 0.031),
            );
        return values;
      },
    );
    const packet = {
      ...configuration,
      protocolVersion: 3,
      sourceGeneration: initialization.sourceGeneration,
      workerGeneration: initialization.workerGeneration,
      sequence: sequence++,
      startSample,
      frameCount,
      postSourceSilence,
      buffers: channels.map((channel) => channel.buffer),
    };
    startSample += frameCount;
    return packet;
  }
  function advance(options) {
    return processFeatureWorkerPcm(state, pcm(options)).observation;
  }
  return {
    state,
    topology,
    pcm,
    advance,
    initialization,
    model: () => ({ topology, observation: advance() }),
  };
}
