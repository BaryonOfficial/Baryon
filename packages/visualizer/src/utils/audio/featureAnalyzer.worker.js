import * as ort from "onnxruntime-web/wasm";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { EPSILON, HINT_WINDOW_SIZE, MEL_BIN_COUNT } from "./featureAnalyzer.js";

const MODEL_OUTPUT_KEYS = Object.freeze([
  "pitchConfidence",
  "harmonicity",
  "transientSalience",
  "bassSalience",
  "novelty",
  "textureSpread",
  "voicingProbability",
  "releaseBias",
]);

let session = null;
let initialized = false;
let running = false;
let pendingInference = false;
let modelVersion = "unknown";
let hintCadenceMs = 32;
let modelInputSize = 10;
let lastInferenceAtMs = Number.NEGATIVE_INFINITY;
let latestFrame = null;

const melFrames = Array.from({ length: HINT_WINDOW_SIZE }, () => null);
const rmsFrames = new Float32Array(HINT_WINDOW_SIZE);
const amplitudeFrames = new Float32Array(HINT_WINDOW_SIZE);
const centroidFrames = new Float32Array(HINT_WINDOW_SIZE);
const fluxFrames = new Float32Array(HINT_WINDOW_SIZE);
const lowBandFrames = new Float32Array(HINT_WINDOW_SIZE);
let writeIndex = 0;
let frameCount = 0;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mean(buffer, count = frameCount) {
  if (!(count > 0)) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += buffer[index] ?? 0;
  }
  return total / count;
}

function cosineDistance(left, right) {
  if (!left || !right) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm <= EPSILON || rightNorm <= EPSILON) {
    return 0;
  }

  return clamp01(1 - dot / Math.sqrt(leftNorm * rightNorm));
}

function spectralFlatness(values) {
  if (!values?.length) {
    return 1;
  }

  let arithmeticMean = 0;
  let logTotal = 0;
  let activeCount = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.max(values[index] ?? 0, EPSILON);
    arithmeticMean += value;
    logTotal += Math.log(value);
    activeCount += 1;
  }

  if (!activeCount || arithmeticMean <= EPSILON) {
    return 1;
  }

  const geometricMean = Math.exp(logTotal / activeCount);
  return clamp01(geometricMean / (arithmeticMean / activeCount));
}

function summarizeCurrentMel(currentMel) {
  if (!currentMel?.length) {
    return {
      harmonicFocus: 0,
      textureSpread: 0,
    };
  }

  let total = 0;
  let activeBins = 0;
  const strongest = [];
  for (let index = 0; index < currentMel.length; index += 1) {
    const value = currentMel[index] ?? 0;
    total += value;
    if (value > 0.08) {
      activeBins += 1;
    }
    strongest.push(value);
  }
  strongest.sort((left, right) => right - left);
  const topEnergy =
    (strongest[0] ?? 0) + (strongest[1] ?? 0) + (strongest[2] ?? 0);
  const focus = clamp01(topEnergy / Math.max(EPSILON, total));
  const spread = clamp01(
    (activeBins / currentMel.length) * 0.55 +
      (1 - spectralFlatness(currentMel)) * 0.45,
  );

  return {
    harmonicFocus: focus,
    textureSpread: spread,
  };
}

function summarizeWindow() {
  const count = Math.max(1, frameCount);
  const currentIndex = (writeIndex - 1 + HINT_WINDOW_SIZE) % HINT_WINDOW_SIZE;
  const currentMel = melFrames[currentIndex] ?? new Float32Array(MEL_BIN_COUNT);
  const previousIndex =
    (currentIndex - 1 + HINT_WINDOW_SIZE) % HINT_WINDOW_SIZE;
  const priorMel = melFrames[previousIndex];
  const { harmonicFocus, textureSpread } = summarizeCurrentMel(currentMel);
  const currentRms = clamp01(rmsFrames[currentIndex] ?? 0);
  const meanRms = clamp01(mean(rmsFrames, count));
  const meanFlux = clamp01(mean(fluxFrames, count));
  const meanCentroid = clamp01(mean(centroidFrames, count));
  const meanLowBand = clamp01(mean(lowBandFrames, count));
  const currentEnergy = clamp01(amplitudeFrames[currentIndex] ?? 0);
  const meanEnergy = clamp01(mean(amplitudeFrames, count));
  const novelty = clamp01(cosineDistance(currentMel, priorMel));
  const energyDelta = clamp01(Math.max(0, currentEnergy - meanEnergy));
  const voicingSeed = clamp01(
    harmonicFocus * 0.55 +
      currentRms * 0.18 +
      (1 - meanCentroid) * 0.14 +
      meanLowBand * 0.18 -
      novelty * 0.1,
  );

  return {
    inputVector: new Float32Array([
      currentRms,
      meanRms,
      meanFlux,
      meanCentroid,
      meanLowBand,
      novelty,
      harmonicFocus,
      energyDelta,
      textureSpread,
      voicingSeed,
    ]),
    novelty,
    harmonicFocus,
    textureSpread,
    voicingSeed,
  };
}

function buildHintPayload(frame, outputVector, latencyMs) {
  const hint = {
    frameId: frame.frameId,
    frameTimeMs: frame.frameTimeMs,
    inputMode: frame.inputMode,
    sessionKey: frame.sessionKey,
    workerState: "ready",
    workerStatus: {
      state: "ready",
      reason: "model-ready",
      error: null,
      modelVersion,
    },
    analysisLatencyMs: latencyMs,
  };

  for (let index = 0; index < MODEL_OUTPUT_KEYS.length; index += 1) {
    hint[MODEL_OUTPUT_KEYS[index]] = clamp01(outputVector[index] ?? 0);
  }

  return hint;
}

function storeFrame(frame) {
  const melFrame =
    frame.mel64 instanceof Float32Array
      ? frame.mel64
      : new Float32Array(frame.mel64);
  melFrames[writeIndex] = melFrame;
  rmsFrames[writeIndex] = clamp01(frame.rms ?? 0);
  amplitudeFrames[writeIndex] = clamp01(frame.avgAmplitude ?? 0);
  centroidFrames[writeIndex] = clamp01(frame.spectralCentroid ?? 0);
  fluxFrames[writeIndex] = clamp01(frame.spectralFlux ?? 0);
  lowBandFrames[writeIndex] = clamp01(frame.lowBandEnergy ?? 0);
  latestFrame = frame;
  writeIndex = (writeIndex + 1) % HINT_WINDOW_SIZE;
  frameCount = Math.min(HINT_WINDOW_SIZE, frameCount + 1);
}

async function runInference() {
  if (!initialized || running || !session || !latestFrame) {
    return;
  }
  if (latestFrame.frameTimeMs - lastInferenceAtMs < hintCadenceMs) {
    return;
  }

  running = true;
  pendingInference = false;
  const startedAt =
    typeof performance?.now === "function" ? performance.now() : Date.now();
  try {
    const summary = summarizeWindow();
    const tensor = new ort.Tensor("float32", summary.inputVector, [
      1,
      modelInputSize,
    ]);
    const feeds = { input: tensor };
    const results = await session.run(feeds);
    const outputTensor = results.output;
    const outputVector = outputTensor?.data ?? [];
    const latencyMs =
      (typeof performance?.now === "function"
        ? performance.now()
        : Date.now()) - startedAt;

    lastInferenceAtMs = latestFrame.frameTimeMs;
    postMessage({
      type: "hint",
      hint: buildHintPayload(latestFrame, outputVector, latencyMs),
    });
  } catch (error) {
    postMessage({
      type: "status",
      state: "failed",
      reason: "inference-error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
    if (pendingInference) {
      void runInference();
    }
  }
}

async function initializeWorker(settings) {
  modelVersion = settings?.modelVersion ?? "bootstrap-audio-hints-v1";
  hintCadenceMs = Math.max(16, settings?.hintCadenceMs ?? 32);
  modelInputSize = Math.max(1, settings?.modelInputSize ?? 10);
  postMessage({
    type: "status",
    state: "loading",
    reason: "model-loading",
    error: null,
  });

  try {
    ort.env.wasm.proxy = false;
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
      wasm: ortWasmUrl,
    };

    const response = await fetch(settings.modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to load model: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    session = await ort.InferenceSession.create(buffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    initialized = true;
    postMessage({
      type: "status",
      state: "ready",
      reason: "model-ready",
      error: null,
    });
  } catch (error) {
    initialized = false;
    session = null;
    postMessage({
      type: "status",
      state: "failed",
      reason: "model-load-failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener("message", (event) => {
  const payload = event?.data ?? {};
  if (payload.type === "init") {
    void initializeWorker(payload.settings ?? {});
    return;
  }

  if (payload.type !== "frame" || !payload.frame) {
    return;
  }

  storeFrame(payload.frame);
  if (!initialized || !session) {
    return;
  }

  if (running) {
    pendingInference = true;
    return;
  }

  void runInference();
});
