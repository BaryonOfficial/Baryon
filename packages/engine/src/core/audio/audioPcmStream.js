function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function configurationOf(input) {
  const config = {
    sourceGeneration: input.sourceGeneration,
    timelineRevision: input.timelineRevision,
    processingRevision: input.processingRevision,
    sampleRate: input.sampleRate,
    channelCount: input.channelCount,
    startSample: input.startSample ?? 0,
    nextSequence: input.nextSequence ?? 0,
  };
  if (
    !Number.isSafeInteger(config.sourceGeneration) ||
    config.sourceGeneration < 1 ||
    !nonnegativeInteger(config.timelineRevision) ||
    !nonnegativeInteger(config.processingRevision) ||
    !Number.isFinite(config.sampleRate) ||
    config.sampleRate <= 0 ||
    ![1, 2].includes(config.channelCount) ||
    !nonnegativeInteger(config.startSample) ||
    !nonnegativeInteger(config.nextSequence)
  ) {
    throw new RangeError(
      "invalid PCM generation, timeline, processing or channel configuration",
    );
  }
  return config;
}

function validChannels(channels, channelCount, length) {
  return (
    Array.isArray(channels) &&
    channels.length === channelCount &&
    channels.every(
      (channel) =>
        (channel instanceof Float32Array || channel instanceof Float64Array) &&
        channel.length === length &&
        channel.every(Number.isFinite),
    )
  );
}

/**
 * Admission owner for consecutive PCM. Session commands alone may reset or
 * rebase it. `accept` invokes a synchronous processor once; a fault prevents
 * further consumption until an explicit, newer generation/revision arrives.
 * Consumers must discard acoustic history when discontinuity is reported.
 */
export function createAudioPcmStream(configuration) {
  let config = configurationOf(configuration);
  let nextSample = config.startSample;
  let nextSequence = config.nextSequence;
  let processedFrames = 0;
  let sourceFrames = 0;
  let sourceEndSample = null;
  let phase = "running";
  let fault = null;
  function discontinuity(reason) {
    phase = "discontinuous";
    fault = reason;
    return { accepted: false, reason, discontinuity: true };
  }
  function assertNotProcessing() {
    if (phase === "processing")
      throw new Error("PCM processing cannot re-enter session lifecycle");
  }
  return {
    accept(packet, consume) {
      if (
        packet?.sourceGeneration !== config.sourceGeneration ||
        packet.timelineRevision !== config.timelineRevision ||
        packet.processingRevision !== config.processingRevision
      ) {
        return { accepted: false, reason: "generation-mismatch" };
      }
      if (phase !== "running" && phase !== "draining")
        return { accepted: false, reason: phase };
      const { sequence, startSample, frameCount } = packet;
      if (
        !nonnegativeInteger(sequence) ||
        !nonnegativeInteger(startSample) ||
        !Number.isSafeInteger(frameCount) ||
        frameCount < 1 ||
        !Number.isSafeInteger(startSample + frameCount) ||
        packet.sampleRate !== config.sampleRate ||
        packet.channelCount !== config.channelCount ||
        !validChannels(packet.channels, config.channelCount, frameCount)
      ) {
        return discontinuity("invalid-pcm");
      }
      if (sequence < nextSequence)
        return { accepted: false, reason: "duplicate" };
      if (startSample + frameCount <= nextSample)
        return { accepted: false, reason: "stale-block" };
      if (sequence !== nextSequence || startSample !== nextSample)
        return discontinuity("sample-gap-or-overlap");
      if (sourceEndSample !== null && packet.postSourceSilence !== true)
        return { accepted: false, reason: "source-ended" };
      if (
        packet.postSourceSilence === true &&
        (sourceEndSample === null ||
          !packet.channels.every((channel) =>
            channel.every((value) => value === 0),
          ))
      )
        return discontinuity("invalid-post-source-silence");
      if (typeof consume !== "function")
        throw new TypeError("a synchronous PCM processor is required");
      if (
        !Number.isSafeInteger(processedFrames + frameCount) ||
        !Number.isSafeInteger(sequence + 1)
      )
        return discontinuity("cursor-overflow");
      phase = "processing";
      try {
        const result = consume(packet);
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch(() => {});
          throw new TypeError("PCM processing must finish synchronously");
        }
      } catch (error) {
        discontinuity("processing-failed");
        throw error;
      }
      nextSample = startSample + frameCount;
      nextSequence = sequence + 1;
      processedFrames += frameCount;
      if (sourceEndSample === null) sourceFrames += frameCount;
      phase = sourceEndSample === null ? "running" : "draining";
      return { accepted: true, processedFrames };
    },
    pause() {
      assertNotProcessing();
      if (phase === "running" || phase === "draining") phase = "paused";
    },
    end(marker) {
      assertNotProcessing();
      if (
        marker?.sourceGeneration !== config.sourceGeneration ||
        marker.timelineRevision !== config.timelineRevision ||
        marker.processingRevision !== config.processingRevision
      )
        return { accepted: false, reason: "generation-mismatch" };
      if (sourceEndSample !== null)
        return { accepted: false, reason: "source-ended" };
      if (phase !== "running" && phase !== "paused")
        return { accepted: false, reason: phase };
      if (
        marker.startSample !== nextSample ||
        marker.nextSequence !== nextSequence
      )
        return discontinuity("end-cursor-mismatch");
      sourceEndSample = nextSample;
      if (phase !== "paused") phase = "draining";
      return { accepted: true, processedFrames };
    },
    invalidate(reason = "capture-fault") {
      assertNotProcessing();
      return discontinuity(reason);
    },
    resume({ startSample, nextSequence: sequence }) {
      assertNotProcessing();
      if (
        phase !== "paused" ||
        !nonnegativeInteger(startSample) ||
        startSample < nextSample ||
        !nonnegativeInteger(sequence) ||
        sequence < nextSequence
      ) {
        throw new RangeError(
          "resume requires a paused stream and a monotonic capture cursor",
        );
      }
      nextSample = startSample;
      nextSequence = sequence;
      phase = sourceEndSample === null ? "running" : "draining";
    },
    reset(next) {
      assertNotProcessing();
      const candidate = configurationOf(next);
      const newer =
        candidate.sourceGeneration > config.sourceGeneration ||
        (candidate.sourceGeneration === config.sourceGeneration &&
          (candidate.timelineRevision > config.timelineRevision ||
            (candidate.timelineRevision === config.timelineRevision &&
              candidate.processingRevision > config.processingRevision)));
      if (!newer)
        throw new RangeError(
          "reset requires a newer source/timeline/processing revision",
        );
      config = candidate;
      nextSample = config.startSample;
      nextSequence = config.nextSequence;
      processedFrames = 0;
      sourceFrames = 0;
      sourceEndSample = null;
      fault = null;
      phase = "running";
    },
    read() {
      return {
        ...config,
        nextSample,
        nextSequence,
        processedFrames,
        sourceFrames,
        postSourceFrames: processedFrames - sourceFrames,
        sourceEndSample,
        phase,
        fault,
      };
    },
  };
}

/**
 * Offline iterator at the supplied sample rate. Resampling belongs upstream;
 * the iterator neither downmixes nor treats overlapping windows as new audio.
 */
export function* iterateAudioPcmBlocks(
  channels,
  configuration,
  blockFrames = 512,
) {
  const config = configurationOf(configuration);
  const length = channels?.[0]?.length;
  if (
    !Number.isSafeInteger(blockFrames) ||
    blockFrames < 1 ||
    !Number.isSafeInteger(length) ||
    !validChannels(channels, config.channelCount, length)
  ) {
    throw new RangeError("invalid decoded PCM or block size");
  }
  let sequence = config.nextSequence;
  for (let offset = 0; offset < length; offset += blockFrames) {
    const end = Math.min(length, offset + blockFrames);
    yield {
      sourceGeneration: config.sourceGeneration,
      timelineRevision: config.timelineRevision,
      processingRevision: config.processingRevision,
      sampleRate: config.sampleRate,
      channelCount: config.channelCount,
      startSample: config.startSample + offset,
      sequence: sequence++,
      frameCount: end - offset,
      channels: channels.map((channel) => channel.subarray(offset, end)),
    };
  }
}
