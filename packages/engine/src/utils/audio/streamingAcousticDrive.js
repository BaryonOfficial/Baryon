import { createWaterAcousticFrameTransform } from "./waterAcousticNonlinearity.js";

const DC_CUTOFF_HZ = 5;
const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

/**
 * H(s)=s/(s+2*pi*5), with a zero-order-held input. The low-pass state
 * is exact at sample boundaries; y[n]=x[n]-low[n] is sampled at the start
 * of each hold. The response stage holds this prepared sequence in turn.
 * No frame mean, clipping, channel normalization or timing authority lives here.
 */
export function createAcousticDcBlocker({ sampleRate, channelCount }) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 2 * DC_CUTOFF_HZ ||
    ![1, 2].includes(channelCount)
  ) {
    throw new RangeError(
      "DC preparation requires a valid audio rate and mono/stereo layout",
    );
  }
  const low = new Float64Array(channelCount);
  const fraction = -Math.expm1((-2 * Math.PI * DC_CUTOFF_HZ) / sampleRate);
  return {
    process(channels, output) {
      const length = channels?.[0]?.length;
      if (
        channels?.length !== channelCount ||
        output?.length !== channelCount ||
        !Number.isSafeInteger(length)
      ) {
        throw new RangeError("DC preparation channel layout changed");
      }
      for (let a = 0; a < channelCount; a++) {
        if (
          !(
            channels[a] instanceof Float32Array ||
            channels[a] instanceof Float64Array
          ) ||
          channels[a].length !== length ||
          !channels[a].every(Number.isFinite) ||
          !(output[a] instanceof Float64Array) ||
          output[a].length !== length
        ) {
          throw new RangeError(
            "DC preparation requires finite PCM and matching Float64 outputs",
          );
        }
        // Distinct pooled output storage keeps validation/processing atomic
        // and prevents one channel overwriting another channel's input.
        if (
          channels.some((input) => input.buffer === output[a].buffer) ||
          output.some(
            (target, b) => a !== b && target.buffer === output[a].buffer,
          )
        ) {
          throw new RangeError(
            "DC preparation outputs must have independent storage",
          );
        }
      }
      for (let a = 0; a < channelCount; a++) {
        let value = low[a];
        for (let n = 0; n < length; n++) {
          const difference = channels[a][n] - value;
          output[a][n] = difference;
          value += fraction * difference;
        }
        low[a] = value;
      }
    },
  };
}

/**
 * Continuous preparation, including clocked zero forcing after source end.
 * Every sample is emitted once at its analysis coordinate with the declared
 * FRAME_SIZE-sample nonlinear availability delay. Lifecycle stays upstream:
 * there is no terminal flush that can crop a tail or publish future state.
 * A pause does not call process. Output views are borrowed only
 * during the synchronous callback; consumers must copy any retained data.
 */
export function createStreamingAcousticDrive({
  sampleRate,
  channelCount,
  cavityAcousticScale,
}) {
  const dc = createAcousticDcBlocker({ sampleRate, channelCount });
  const transform = createWaterAcousticFrameTransform({
    sampleRate,
    cavityAcousticScale,
    size: FRAME_SIZE,
  });
  const allocateChannels = (length) =>
    Array.from({ length: channelCount }, () => new Float64Array(length));
  const active = transform.active;
  const inputRing = active ? allocateChannels(FRAME_SIZE) : null;
  // A hop completion can write the newest source interval before the oldest
  // delayed output is emitted. Two apertures avoid that modulo alias.
  const sumRing = active ? allocateChannels(2 * FRAME_SIZE) : null;
  const frame = active ? new Float64Array(FRAME_SIZE) : null;
  const projected = active ? allocateChannels(FRAME_SIZE) : null;
  const pending = allocateChannels(HOP_SIZE);
  const filtered = allocateChannels(HOP_SIZE);
  const weights = Float64Array.from(
    { length: FRAME_SIZE },
    (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FRAME_SIZE),
  );
  const denominator = Float64Array.from(
    { length: HOP_SIZE },
    (_, n) =>
      weights[n] +
      weights[n + HOP_SIZE] +
      weights[n + 2 * HOP_SIZE] +
      weights[n + 3 * HOP_SIZE],
  );
  let inputFrames = 0;
  let preparedFrames = 0;
  let pendingFrames = 0;
  let phase = "running";

  function flush(emit) {
    if (!pendingFrames) return;
    const input = pending.map((c) => c.subarray(0, pendingFrames));
    const output = filtered.map((c) => c.subarray(0, pendingFrames));
    dc.process(input, output);
    const startFrame = preparedFrames - pendingFrames;
    const result = emit(output, {
      startFrame,
      frameCount: pendingFrames,
      availableAfterInputFrame: preparedFrames + (active ? FRAME_SIZE : 0),
    });
    if (result && typeof result.then === "function") {
      Promise.resolve(result).catch(() => {});
      throw new TypeError("prepared audio must be consumed synchronously");
    }
    pendingFrames = 0;
  }

  function emitUntil(end, emit) {
    while (preparedFrames < end) {
      for (let a = 0; a < channelCount; a++) {
        const slot = preparedFrames % (2 * FRAME_SIZE);
        pending[a][pendingFrames] =
          sumRing[a][slot] / denominator[preparedFrames % HOP_SIZE];
        sumRing[a][slot] = 0;
      }
      preparedFrames++;
      pendingFrames++;
      if (pendingFrames === HOP_SIZE) flush(emit);
    }
  }

  function projectFrame() {
    const start = inputFrames - FRAME_SIZE;
    let inputEnergy = 0;
    let projectedEnergy = 0;
    for (let a = 0; a < channelCount; a++) {
      for (let n = 0; n < FRAME_SIZE; n++) {
        const index = start + n;
        frame[n] = index < 0 ? 0 : inputRing[a][index % FRAME_SIZE];
      }
      const energy = transform.transform(frame, projected[a]);
      inputEnergy += energy.inputEnergy;
      projectedEnergy += energy.projectedEnergy;
    }
    if (
      !Number.isFinite(inputEnergy) ||
      !Number.isFinite(projectedEnergy) ||
      (inputEnergy > 0 && !(projectedEnergy > 0))
    )
      throw new RangeError("invalid shared nonlinear frame energy");
    const gain = inputEnergy > 0 ? Math.sqrt(inputEnergy / projectedEnergy) : 0;
    for (let a = 0; a < channelCount; a++)
      for (let n = Math.max(0, -start); n < FRAME_SIZE; n++)
        sumRing[a][(start + n) % (2 * FRAME_SIZE)] +=
          projected[a][n] * gain * weights[n];
  }

  function assertRunning(emit) {
    if (phase !== "running") throw new Error(`preparation is ${phase}`);
    if (typeof emit !== "function")
      throw new TypeError("a synchronous prepared-audio consumer is required");
  }

  return {
    process(channels, emit) {
      assertRunning(emit);
      const length = channels?.[0]?.length;
      if (
        channels?.length !== channelCount ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        !Number.isSafeInteger(inputFrames + length) ||
        !channels.every(
          (c) =>
            (c instanceof Float32Array || c instanceof Float64Array) &&
            c.length === length &&
            c.every(Number.isFinite),
        )
      )
        throw new TypeError(
          "preparation requires complete finite mono/stereo PCM",
        );
      phase = "processing";
      try {
        if (!active) {
          for (let n = 0; n < length; n++) {
            for (let a = 0; a < channelCount; a++)
              pending[a][pendingFrames] = channels[a][n];
            inputFrames++;
            preparedFrames++;
            pendingFrames++;
            if (pendingFrames === HOP_SIZE) flush(emit);
          }
        } else {
          for (let n = 0; n < length; n++) {
            for (let a = 0; a < channelCount; a++)
              inputRing[a][inputFrames % FRAME_SIZE] = channels[a][n];
            inputFrames++;
            if (inputFrames % HOP_SIZE === 0) projectFrame();
            emitUntil(Math.max(0, inputFrames - FRAME_SIZE), emit);
          }
        }
        flush(emit);
        phase = "running";
      } catch (error) {
        phase = "faulted";
        throw error;
      }
    },
    read: () => ({
      phase,
      active,
      inputFrames,
      preparedFrames,
      delayFrames: active ? FRAME_SIZE : 0,
      pendingFrames: inputFrames - preparedFrames,
    }),
  };
}
