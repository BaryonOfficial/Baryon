import { createAudioPcmStream } from "../../core/audio/audioPcmStream.js";
import { createStreamingAcousticDrive } from "./streamingAcousticDrive.js";
import { createBroadbandModalResponse } from "./broadbandModalResponse.js";

function acousticState({
  configuration,
  shells,
  exposureSeconds,
  cavityAcousticScale,
}) {
  if (!cavityAcousticScale)
    throw new TypeError(
      "broadband state requires an explicit signal-preparation apparatus",
    );
  return {
    preparation: createStreamingAcousticDrive({
      ...configuration,
      cavityAcousticScale,
    }),
    response: createBroadbandModalResponse({
      sampleRate: configuration.sampleRate,
      channelCount: configuration.channelCount,
      shells,
      exposureSeconds,
    }),
  };
}

/**
 * Candidate audio-state owner. Admission and preparation run once per accepted
 * sample; only completed prepared intervals advance response. Explicit source
 * completion admits clocked zero forcing; it never flushes or advances state.
 * Reads, pause and source-end notifications cannot create acoustic time.
 */
export function createBroadbandAudioState(options) {
  const stream = createAudioPcmStream(options.configuration);
  let state = acousticState(options);
  const advance = (channels) => state.response.advance(channels);
  return {
    accept: (packet) =>
      stream.accept(packet, ({ channels }) =>
        state.preparation.process(channels, advance),
      ),
    end: (marker) => stream.end(marker),
    pause: () => stream.pause(),
    invalidate: (reason) => stream.invalidate(reason),
    resume: (cursor) => stream.resume(cursor),
    reset(next) {
      // Construct first: invalid apparatus settings cannot partly reset the
      // admitted generation. The stream validates monotonic revision authority.
      const candidate = acousticState(next);
      stream.reset(next.configuration);
      state = candidate;
    },
    read() {
      const status = stream.read();
      return {
        ...status,
        preparation: state.preparation.read(),
        response:
          status.phase === "discontinuous" ? null : state.response.read(),
      };
    },
  };
}
