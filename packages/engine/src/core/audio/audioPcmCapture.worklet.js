/* global AudioWorkletProcessor, registerProcessor, currentFrame, sampleRate */

const BLOCK_FRAMES = 512;
// Budget for delayed worker consumption or buffer-return delivery, not a
// processing-latency target. Native debugger attachment has stalled delivery
// for over 300 ms even when each PCM packet takes only 2 ms to process.
const RETURN_STALL_SECONDS = 0.5;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Analysis-only tap. The session commands the sample interval; the rendering
 * clock supplies its samples. Buffer return, downstream reads and reconnects
 * cannot start or recover capture. No sample buffers are allocated in process.
 */
class AudioPcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions;
    if (
      !integer(config.sourceGeneration) ||
      config.sourceGeneration < 1 ||
      !integer(config.timelineRevision) ||
      !integer(config.processingRevision) ||
      ![1, 2].includes(config.channelCount) ||
      !integer(config.startSample ?? 0) ||
      (config.sampleRate !== undefined && config.sampleRate !== sampleRate)
    ) {
      throw new RangeError("invalid PCM capture configuration");
    }
    this.pcmPort = null;
    this.phase = "idle";
    this.startFrame = 0;
    this.startEvent = "started";
    this.boundary = null;
    this.sourceEndFrame = null;
    this.sourceEndSample = null;
    this.expectedFrame = null;
    this.nextSample = config.startSample ?? 0;
    this.nextSequence = 0;
    this.currentSlot = null;
    this.usedFrames = 0;
    this.identity = {
      protocolVersion: config.protocolVersion,
      workerGeneration: config.workerGeneration,
      sourceGeneration: config.sourceGeneration,
      timelineRevision: config.timelineRevision,
      processingRevision: config.processingRevision,
      sampleRate,
      channelCount: config.channelCount,
    };
    // Keep one additional slot for the packet already being filled when a
    // return stall starts. All storage is allocated before capture begins.
    const count =
      1 + Math.ceil((sampleRate * RETURN_STALL_SECONDS) / BLOCK_FRAMES);
    this.slots = Array.from({ length: count }, (_, slot) => {
      const channels = Array.from(
        { length: config.channelCount },
        () => new Float32Array(BLOCK_FRAMES),
      );
      const buffers = channels.map((channel) => channel.buffer);
      return {
        channels,
        inFlight: false,
        packet: {
          ...this.identity,
          type: "pcm",
          slot,
          startSample: 0,
          contextFrame: 0,
          sequence: 0,
          frameCount: 0,
          postSourceSilence: false,
          buffers,
        },
      };
    });
    this.freeSlots = this.slots.map((_, i) => i);
    this.port.onmessage = ({ data }) => this.command(data);
    // Offline rendering can outrun MessagePort delivery before its first
    // quantum. A known initial interval uses the same commands in construction.
    if (config.initialInterval) {
      this.command({
        type: "start",
        contextFrame: config.initialInterval.startFrame,
      });
      this.command({
        type: "end",
        contextFrame: config.initialInterval.endFrame,
      });
      if (config.initialInterval.pauseFrame !== undefined)
        this.command({
          type: "pause",
          contextFrame: config.initialInterval.pauseFrame,
        });
    }
  }

  event(type, contextFrame, reason = null) {
    const event = {
      ...this.identity,
      type,
      reason,
      contextFrame,
      startSample: this.nextSample,
      nextSequence: this.nextSequence,
      phase: this.phase,
      postSourceSilence: this.sourceEndSample !== null,
    };
    this.pcmPort?.postMessage(event);
    this.port.postMessage(event);
  }

  fail(reason, frame = currentFrame) {
    if (this.phase === "faulted" || this.phase === "closed") return;
    this.phase = "faulted";
    this.event("fault", frame, reason);
  }

  command(message) {
    if (message?.type === "close") {
      this.pcmPort?.close();
      this.phase = "closed";
      return;
    }
    if (message?.type === "end" && this.sourceEndFrame === message.contextFrame)
      return;
    if (this.phase === "faulted" || this.phase === "closed") return;
    if (message?.type === "connect-pcm") {
      if (
        this.phase !== "idle" ||
        this.pcmPort ||
        !message.port ||
        !integer(this.identity.workerGeneration) ||
        this.identity.workerGeneration < 1 ||
        !integer(this.identity.protocolVersion)
      ) {
        this.fail("invalid-pcm-connection");
        return;
      }
      this.pcmPort = message.port;
      this.pcmPort.onmessage = ({ data }) => {
        // The worker can return storage, never issue source commands.
        if (data?.type !== "recycle") this.fail("invalid-pcm-return");
        else if (data.accepted?.accepted !== true)
          this.fail(data.accepted?.reason ?? "pcm-rejected");
        else this.recycle(data);
      };
      this.pcmPort.onmessageerror = () => this.fail("pcm-message-error");
      this.pcmPort.start();
      return;
    }
    if (message?.type === "recycle") {
      if (this.pcmPort) this.fail("unexpected-main-thread-recycle");
      else this.recycle(message);
      return;
    }
    const frame = message?.contextFrame ?? currentFrame;
    if (!integer(frame) || frame < currentFrame) {
      this.fail("late-or-invalid-command");
      return;
    }
    if (
      (message?.type === "start" && this.phase === "idle") ||
      (message?.type === "resume" && this.phase === "paused")
    ) {
      const startSample = message.startSample ?? this.nextSample;
      if (
        this.boundary ||
        !integer(startSample) ||
        startSample < this.nextSample
      ) {
        this.fail("invalid-resume");
        return;
      }
      this.startEvent = message.type === "start" ? "started" : "resumed";
      this.startFrame = frame;
      this.nextSample = startSample;
      this.expectedFrame = null;
      this.phase = "armed";
      return;
    }
    if (
      message?.type === "pause" &&
      (this.phase === "armed" ||
        this.phase === "running" ||
        this.phase === "draining") &&
      !this.boundary &&
      (this.phase !== "armed" || frame >= this.startFrame)
    ) {
      this.boundary = { frame, type: message.type };
      return;
    }
    if (
      message?.type === "end" &&
      this.sourceEndSample === null &&
      this.sourceEndFrame === null &&
      (this.phase === "armed" ||
        this.phase === "running" ||
        this.phase === "paused") &&
      (this.phase !== "armed" || frame >= this.startFrame)
    ) {
      this.sourceEndFrame = frame;
      if (this.phase === "paused") {
        if (frame !== currentFrame) {
          this.fail("invalid-paused-end");
          return;
        }
        this.sourceEndSample = this.nextSample;
        this.event("ended", frame);
      }
      return;
    }
    this.fail("invalid-command");
  }

  recycle(message) {
    if (this.phase === "faulted" || this.phase === "closed") return;
    const slot = this.slots[message.slot];
    const buffers = message.buffers;
    if (
      !integer(message.slot) ||
      !slot?.inFlight ||
      message.sequence !== slot.packet.sequence ||
      !Array.isArray(buffers) ||
      buffers.length !== this.identity.channelCount ||
      !buffers.every(
        (buffer) =>
          buffer instanceof ArrayBuffer &&
          buffer.byteLength === BLOCK_FRAMES * Float32Array.BYTES_PER_ELEMENT,
      ) ||
      new Set(buffers).size !== buffers.length
    ) {
      this.fail("invalid-recycle");
      return;
    }
    // Only wrappers are recreated after transfer, in the message handler.
    slot.packet.buffers = buffers;
    slot.channels = buffers.map((buffer) => new Float32Array(buffer));
    slot.inFlight = false;
    this.freeSlots.push(message.slot);
  }

  flush() {
    if (!this.currentSlot || this.usedFrames === 0) return;
    const slot = this.currentSlot;
    slot.packet.frameCount = this.usedFrames;
    slot.inFlight = true;
    (this.pcmPort ?? this.port).postMessage(slot.packet, slot.packet.buffers);
    this.nextSequence++;
    this.currentSlot = null;
    this.usedFrames = 0;
  }

  process(inputs, outputs) {
    // Web Audio initializes outputs to zero. This tap never writes audible data.
    if (this.phase === "closed" || this.phase === "faulted") return false;
    if (this.phase === "idle" || this.phase === "paused") return true;
    const frames = outputs[0][0].length;
    const endFrame = currentFrame + frames;
    let cursor = currentFrame;
    if (this.phase === "armed") {
      if (this.startFrame >= endFrame) return true;
      if (this.startFrame < currentFrame) {
        this.fail("late-start");
        return false;
      }
      cursor = this.startFrame;
      this.phase = this.sourceEndSample === null ? "running" : "draining";
      this.event(this.startEvent, cursor);
    } else if (this.expectedFrame !== currentFrame) {
      this.fail("context-frame-gap");
      return false;
    }
    if (
      this.sourceEndSample === null &&
      this.sourceEndFrame !== null &&
      this.sourceEndFrame < cursor
    ) {
      this.fail("late-source-end", cursor);
      return false;
    }
    while (cursor <= endFrame) {
      if (this.sourceEndSample === null && this.sourceEndFrame === cursor) {
        this.flush();
        this.sourceEndSample = this.nextSample;
        this.phase = "draining";
        this.event("ended", cursor);
      }
      if (this.boundary?.frame === cursor) {
        this.flush();
        this.phase = "paused";
        if (this.sourceEndSample === null) this.sourceEndFrame = null;
        this.boundary = null;
        this.event("paused", cursor);
        break;
      }
      if (cursor === endFrame) break;
      const stop = Math.min(
        endFrame,
        this.boundary?.frame ?? endFrame,
        this.sourceEndSample === null
          ? (this.sourceEndFrame ?? endFrame)
          : endFrame,
      );
      const silence = this.sourceEndSample !== null;
      const input = inputs[0];
      if (!silence && !input?.length) {
        this.fail("missing-input", cursor);
        return false;
      }
      if (
        !silence &&
        input.length !== this.identity.channelCount &&
        !(input.length === 1 && this.identity.channelCount === 2)
      ) {
        this.fail("channel-layout", cursor);
        return false;
      }
      for (let channel = 0; !silence && channel < input.length; channel++) {
        if (input[channel].length !== frames) {
          this.fail("channel-layout", cursor);
          return false;
        }
        for (let i = cursor - currentFrame; i < stop - currentFrame; i++) {
          if (!Number.isFinite(input[channel][i])) {
            this.fail("invalid-pcm", cursor);
            return false;
          }
        }
      }
      while (cursor < stop) {
        if (!this.currentSlot) {
          const id = this.freeSlots.pop();
          if (id === undefined) {
            this.fail("pool-exhausted", cursor);
            return false;
          }
          this.currentSlot = this.slots[id];
          const packet = this.currentSlot.packet;
          packet.startSample = this.nextSample;
          packet.contextFrame = cursor;
          packet.sequence = this.nextSequence;
          packet.postSourceSilence = silence;
        }
        const count = Math.min(stop - cursor, BLOCK_FRAMES - this.usedFrames);
        if (
          !integer(this.nextSample + count) ||
          !integer(this.nextSequence + 1)
        ) {
          this.fail("cursor-overflow", cursor);
          return false;
        }
        for (let channel = 0; channel < this.identity.channelCount; channel++) {
          const target = this.currentSlot.channels[channel];
          for (let i = 0; i < count; i++)
            target[this.usedFrames + i] = silence
              ? 0
              : input[Math.min(channel, input.length - 1)][
                  cursor - currentFrame + i
                ];
        }
        this.usedFrames += count;
        this.nextSample += count;
        cursor += count;
        if (this.usedFrames === BLOCK_FRAMES) this.flush();
      }
    }
    this.expectedFrame = endFrame;
    return true;
  }
}

registerProcessor("baryon-pcm-capture", AudioPcmCapture);
