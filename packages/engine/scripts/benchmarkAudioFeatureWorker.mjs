import { performance } from "node:perf_hooks";
import {
  createFeatureWorkerState,
  processFeatureWorkerFrame,
} from "../src/utils/audio/audioFeatureEngine.worker.js";
import {
  FAST_MODAL_DRIVE_PROBE_LIMIT,
  createFastModalDriveEstimator,
} from "../src/utils/audio/fastModalDriveEstimator.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../src/defaults.js";
import { getCavityModeFrequency } from "../src/utils/cavityModes.js";

const WARM_UP_FRAMES = 100;
const MEASURED_FRAMES = 1000;

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))
  ];
}

function createSnapshot(fftSize, sampleRate) {
  const timeData = new Float32Array(fftSize);
  const fftLinearAmplitudes = new Float32Array(fftSize / 2);
  const frequencies = Array.from(
    { length: 48 },
    (_, index) => 55 * 2 ** (index / 8),
  );
  for (let sampleIndex = 0; sampleIndex < fftSize; sampleIndex += 1) {
    let sample = 0;
    for (let index = 0; index < frequencies.length; index += 1) {
      sample +=
        Math.sin(
          (2 * Math.PI * frequencies[index] * sampleIndex) / sampleRate,
        ) *
        (0.12 / Math.sqrt(index + 1));
    }
    timeData[sampleIndex] = sample;
  }
  for (const [index, frequency] of frequencies.entries()) {
    const bin = Math.max(1, Math.round((frequency * fftSize) / sampleRate));
    fftLinearAmplitudes[bin] = 0.12 / Math.sqrt(index + 1);
  }
  return {
    sourceMode: "file",
    avgAmplitude: 28,
    rms: 0.2,
    spectralCentroid: 0.3,
    spectralFlux: 0.08,
    fftLinearAmplitudes,
    timeData,
  };
}

function installFullProbeContract(state, sampleRate) {
  const committedModes = [...state.committedModes];
  const seenModeKeys = new Set(committedModes.map((mode) => mode.modeKey));
  for (
    let order = 1;
    committedModes.length < FAST_MODAL_DRIVE_PROBE_LIMIT;
    order += 1
  ) {
    for (let u = 0; u <= order; u += 1) {
      for (let v = 0; v <= order - u; v += 1) {
        const w = order - u - v;
        const modeKey = `${u}:${v}:${w}`;
        if (seenModeKeys.has(modeKey)) {
          continue;
        }
        const naturalFrequencyHz = getCavityModeFrequency(u, v, w, {
          acousticScale: CAVITY_ACOUSTIC_DEFAULTS,
          boundaryMode: "neumann",
        });
        if (!(naturalFrequencyHz > 0) || naturalFrequencyHz >= sampleRate / 2) {
          continue;
        }
        const mode = {
          modeKey,
          u,
          v,
          w,
          layer: order % 2 === 0 ? "resonant" : "source-coupled",
          renderLayer: order % 2 === 0 ? "resonant" : "source-coupled",
          naturalFrequencyHz,
          targetEnergy:
            1 - committedModes.length / (FAST_MODAL_DRIVE_PROBE_LIMIT * 2),
          physicalTransfer: 0.8,
          qualityFactor: 10 + order,
          modalResponseEnergy: 0,
          modalResponseDrive: 0,
          amplitude: 0,
          displayAmplitude: 0,
        };
        committedModes.push(mode);
        seenModeKeys.add(modeKey);
        const modalExcitationState =
          state.featureState.analysis.modalExcitationState;
        modalExcitationState.activeModes.set(modeKey, mode);
        modalExcitationState.modalCandidateState.set(modeKey, mode);
        if (committedModes.length === FAST_MODAL_DRIVE_PROBE_LIMIT) {
          break;
        }
      }
      if (committedModes.length === FAST_MODAL_DRIVE_PROBE_LIMIT) {
        break;
      }
    }
  }

  state.committedModes = committedModes;
  state.fastEstimator = createFastModalDriveEstimator({
    committedModes,
    sampleRate,
  });
  state.fastEstimatorSignature = `benchmark:${sampleRate}:48`;
  // Force the canonical worker path to publish a matching 48-mode topology
  // before measured fast-only frames begin.
  state.latestDriveTopology = null;
  state.latestTopologyFingerprint = null;
}

function runProbe(sampleRate) {
  const state = createFeatureWorkerState();
  state.sourceGeneration = 1;
  state.workerGeneration = 1;
  state.configuration = { radius: 1, includeSpectralLight: true };
  const fastPayload = createSnapshot(2048, sampleRate);
  const structuralPayload = createSnapshot(8192, sampleRate);
  const status = {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: 8192,
    fastFftSize: 2048,
    // Exercise the full exact-drive contract even though the shipped renderer
    // exposes a narrower visible atlas prefix.
    capacity: FAST_MODAL_DRIVE_PROBE_LIMIT,
    sampleRate,
    isAudioLoaded: true,
    isPlaying: true,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    playbackSessionId: 1,
    sessionKey: "file:1",
  };
  const bootstrap = processFeatureWorkerFrame(state, {
    frameId: 1,
    sourceGeneration: 1,
    workerGeneration: 1,
    captureTimestampMs: 0,
    fastPayload,
    structuralPayload,
    status,
  });
  void bootstrap;
  installFullProbeContract(state, sampleRate);
  const fullContractSetup = processFeatureWorkerFrame(state, {
    frameId: 2,
    sourceGeneration: 1,
    workerGeneration: 1,
    captureTimestampMs: 16,
    fastPayload,
    structuralPayload: null,
    status,
  });
  if (
    fullContractSetup.topologyPacket?.committedModeCount !==
      FAST_MODAL_DRIVE_PROBE_LIMIT ||
    state.fastEstimator?.result?.probeCount !== FAST_MODAL_DRIVE_PROBE_LIMIT
  ) {
    throw new Error("Integrated worker benchmark did not install 48 probes.");
  }
  const stableDrivePacketBuffers = {
    modalCoefficients: fullContractSetup.drivePacket.modalCoefficients,
    phaseSlots: fullContractSetup.drivePacket.phaseSlots,
    bandEnergies: fullContractSetup.drivePacket.bandEnergies,
    spectralBandEnergies: fullContractSetup.drivePacket.spectralBandEnergies,
  };
  const setupDrivePacketBufferAllocationCount =
    state.drivePacketBufferAllocationCount;

  const durations = [];
  const totalFrames = WARM_UP_FRAMES + MEASURED_FRAMES;
  for (let index = 0; index < totalFrames; index += 1) {
    const startedAt = performance.now();
    const result = processFeatureWorkerFrame(state, {
      frameId: index + 3,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: (index + 2) * 16,
      fastPayload,
      structuralPayload: null,
      status,
    });
    if (
      result.drivePacket.modalCoefficients !==
        stableDrivePacketBuffers.modalCoefficients ||
      result.drivePacket.phaseSlots !== stableDrivePacketBuffers.phaseSlots ||
      result.drivePacket.bandEnergies !==
        stableDrivePacketBuffers.bandEnergies ||
      result.drivePacket.spectralBandEnergies !==
        stableDrivePacketBuffers.spectralBandEnergies ||
      state.drivePacketBufferAllocationCount !==
        setupDrivePacketBufferAllocationCount
    ) {
      throw new Error(
        "Fast packet construction replaced a steady-state typed buffer.",
      );
    }
    const durationMs = performance.now() - startedAt;
    if (index >= WARM_UP_FRAMES) {
      durations.push(durationMs);
    }
  }

  return {
    sampleRate,
    warmUpFrames: WARM_UP_FRAMES,
    measuredFrames: MEASURED_FRAMES,
    committedModeCount: state.committedModes.length,
    probeModeCount: state.fastEstimator?.result?.probeCount ?? 0,
    drivePacketBufferAllocationCount: state.drivePacketBufferAllocationCount,
    steadyStateDrivePacketBufferAllocationCount: 0,
    fastLaneP50Ms: percentile(durations, 0.5),
    fastLaneP95Ms: percentile(durations, 0.95),
    goertzelAverageMs: state.perf.goertzel.averageMs,
    goertzelMaxMs: state.perf.goertzel.maxMs,
  };
}

const results = [44100, 48000].map(runProbe);
// This probe owns the total fast-lane p95 gate. Exact-frequency Goertzel p95
// is isolated from composition jitter by the dedicated fast-modal benchmark.
const passed = results.every((result) => result.fastLaneP95Ms <= 4);

console.log(JSON.stringify({ passed, results }, null, 2));
if (!passed) {
  process.exitCode = 1;
}
