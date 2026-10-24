import { createBroadbandAudioState } from "../utils/audio/broadbandAudioState.js";

// Isolated qualification harness, not a second production analysis service.
// MessagePort ordering puts lifecycle markers before their dependent PCM.
let state;
let publishObservations = false;

function observationTransfers(observation) {
  const response = observation?.response;
  if (!response) return [];
  // read() owns independent snapshots. Transfer only those copies, never the
  // live solver/filter histories or the capture pool's outstanding PCM loans.
  return [
    response.pressure.buffer,
    response.velocity.buffer,
    response.pressureMoments.buffer,
    response.velocityMoments.buffer,
    response.spectral.transitions.buffer,
    response.spectral.inputSpectrum.buffer,
    response.spectral.boundaryDelta.buffer,
  ];
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === "initialize") {
      if (state) throw new Error("capture probe already initialized");
      state = createBroadbandAudioState(data.options);
      publishObservations = data.publishObservations === true;
      self.postMessage({ type: "ready" });
    } else if (data.type === "pcm") {
      const started = performance.now();
      const packet = data.packet;
      const channels = packet.buffers.map(
        (buffer) => new Float32Array(buffer, 0, packet.frameCount),
      );
      const accepted = state.accept({ ...packet, channels });
      const observation =
        publishObservations && accepted.accepted ? state.read() : undefined;
      self.postMessage(
        {
          type: "consumed",
          sequence: packet.sequence,
          accepted,
          buffers: packet.buffers,
          observation,
          processingMs: performance.now() - started,
        },
        { transfer: [...packet.buffers, ...observationTransfers(observation)] },
      );
    } else if (data.type === "paused") {
      state.pause();
    } else if (data.type === "resumed") {
      state.resume(data);
    } else if (data.type === "reset") {
      state.reset(data.options);
      self.postMessage({ type: "reset" });
    } else if (data.type === "fault") {
      state.invalidate(data.reason);
    } else if (data.type === "ended") {
      const result = state.end(data);
      if (!result.accepted)
        throw new Error(`source completion rejected: ${result.reason}`);
    } else if (data.type === "read") {
      const observation = state.read();
      self.postMessage(
        { type: "observation", observation },
        { transfer: observationTransfers(observation) },
      );
    } else {
      throw new Error("unsupported capture probe message");
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
