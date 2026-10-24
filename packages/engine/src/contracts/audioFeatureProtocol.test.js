import { describe, expect, it } from "vitest";
import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  isAudioFeatureTopologyPacket,
  isCompleteAudioFeatureModel,
} from "./audioFeatureProtocol.js";
import { createBroadbandModalResponse } from "../utils/audio/broadbandModalResponse.js";

function fixture() {
  const shells = [
    { naturalFrequencyHz: 118.4, qualityFactor: 15 },
    { naturalFrequencyHz: 236.8, qualityFactor: 30 },
  ];
  const state = createBroadbandModalResponse({
    shells,
    sampleRate: 48000,
    channelCount: 2,
  });
  state.advance([
    Float64Array.from({ length: 512 }, (_, n) => Math.sin(n * 0.017)),
    Float64Array.from({ length: 512 }, (_, n) => Math.cos(n * 0.031)),
  ]);
  const response = state.read();
  const revisions = {
    protocolVersion: 3,
    sourceGeneration: 1,
    workerGeneration: 1,
    timelineRevision: 0,
    processingRevision: 0,
    topologyRevision: 1,
  };
  const {
    transitions,
    frameEndSample,
    inputSpectrum,
    boundaryDelta,
    ...spectrum
  } = response.spectral;
  const topology = {
    ...revisions,
    basisConvention: "rectangular-permutation-v1",
    boundaryMode: "neumann",
    sampleRate: 48000,
    channelCount: 2,
    exposureSeconds: 0.05,
    familyCount: 2,
    shellCount: 2,
    familyIndices: new Uint16Array([0, 0, 2, 0, 0, 4]),
    familyShells: new Uint16Array([0, 1]),
    sourceOverlaps: new Float64Array([0.5, -0.25]),
    naturalFrequenciesHz: new Float64Array([118.4, 236.8]),
    qualityFactors: new Float64Array([15, 30]),
    spectrum: {
      representation: spectrum.representation,
      frameSize: spectrum.frameSize,
      hopSize: spectrum.hopSize,
      transitions,
    },
  };
  const observation = {
    ...revisions,
    frameId: 1,
    startSample: 0,
    endSample: 512,
    inputEndSample: 512,
    preparationDelayFrames: 0,
    sourcePhase: "running",
    pressure: response.pressure,
    velocity: response.velocity,
    pressureMoments: response.pressureMoments,
    velocityMoments: response.velocityMoments,
    normalizationEnergy:
      0.25 * (response.pressureMoments[0] + response.velocityMoments[0]) +
      0.0625 * (response.pressureMoments[3] + response.velocityMoments[3]),
    spectrum: { frameEndSample, inputSpectrum, boundaryDelta },
  };
  return { topology, observation };
}

describe("v3 broadband physical model contract", () => {
  it("accepts a complete actual pressure/velocity observation with its matching topology", () => {
    expect(AUDIO_FEATURE_PROTOCOL_VERSION).toBe(3);
    const model = fixture();
    expect(isAudioFeatureTopologyPacket(model.topology)).toBe(true);
    expect(isCompleteAudioFeatureModel(model)).toBe(true);
    expect(model.observation).not.toHaveProperty("phaseSlots");
    expect(model.topology).not.toHaveProperty("fastProbeModeIndices");
  });

  it("rejects mixed versions and source, worker, timeline, processing or topology revisions", () => {
    for (const key of [
      "protocolVersion",
      "sourceGeneration",
      "workerGeneration",
      "timelineRevision",
      "processingRevision",
      "topologyRevision",
    ]) {
      const model = fixture();
      model.observation[key]++;
      expect(isCompleteAudioFeatureModel(model), key).toBe(false);
    }
    const old = fixture();
    old.topology.protocolVersion = old.observation.protocolVersion = 2;
    expect(isCompleteAudioFeatureModel(old)).toBe(false);
  });

  it("validates unique canonical families, complete shell mapping, parity and apparatus metadata", () => {
    for (const mutate of [
      (t) => t.familyIndices.set([0, 0, 2], 3),
      (t) => t.familyIndices.set([2, 0, 0], 0),
      (t) => {
        t.familyIndices[2] = 3;
      },
      (t) => {
        t.familyShells[1] = 2;
      },
      (t) => {
        t.familyShells[1] = 0;
      },
      (t) => {
        t.sourceOverlaps[0] = NaN;
      },
      (t) => {
        t.naturalFrequenciesHz[0] = 25000;
      },
      (t) => {
        t.qualityFactors[0] = 0.49;
      },
      (t) => {
        t.spectrum.transitions[0] = Infinity;
      },
    ]) {
      const model = fixture();
      mutate(model.topology);
      expect(isCompleteAudioFeatureModel(model)).toBe(false);
    }
  });

  it("rejects nonfinite, mismatched, asymmetric and indefinite physical moments", () => {
    for (const mutate of [
      (o) => {
        o.pressure[0] = NaN;
      },
      (o) => {
        o.velocityMoments = new Float64Array(3);
      },
      (o) => {
        o.pressureMoments[1] += 1;
      },
      (o) => {
        o.pressureMoments.set([1, 2, 2, 1]);
        o.normalizationEnergy =
          0.25 * (1 + o.velocityMoments[0]) +
          0.0625 * (1 + o.velocityMoments[3]);
      },
      (o) => {
        o.normalizationEnergy *= 2;
      },
    ]) {
      const model = fixture();
      mutate(model.observation);
      expect(isCompleteAudioFeatureModel(model)).toBe(false);
    }
  });

  it("preserves validity under quiet and large gain without an absolute energy floor", () => {
    for (const gain of [1e-12, 1e12]) {
      const model = fixture(),
        o = model.observation;
      for (const array of [
        o.pressure,
        o.velocity,
        o.spectrum.inputSpectrum,
        o.spectrum.boundaryDelta,
      ])
        for (let i = 0; i < array.length; i++) array[i] *= gain;
      for (const array of [o.pressureMoments, o.velocityMoments])
        for (let i = 0; i < array.length; i++) array[i] *= gain * gain;
      o.normalizationEnergy *= gain * gain;
      expect(isCompleteAudioFeatureModel(model)).toBe(true);
    }
  });

  it("validates preparation alignment and color-window age in sample units", () => {
    for (const mutate of [
      (o) => {
        o.startSample = 513;
      },
      (o) => {
        o.preparationDelayFrames = -1;
      },
      (o) => {
        o.inputEndSample++;
      },
      (o) => {
        o.spectrum.frameEndSample++;
      },
      (o) => {
        o.spectrum.frameEndSample = 0;
      },
      (o) => {
        o.spectrum.inputSpectrum = new Float64Array(8);
      },
    ]) {
      const model = fixture();
      mutate(model.observation);
      expect(isCompleteAudioFeatureModel(model)).toBe(false);
    }
    const model = fixture();
    model.observation.preparationDelayFrames = 2048;
    model.observation.inputEndSample += 2048;
    expect(isCompleteAudioFeatureModel(model)).toBe(true);
    model.observation.sourcePhase = "paused";
    model.observation.startSample = model.observation.endSample;
    expect(isCompleteAudioFeatureModel(model)).toBe(true);
  });
});
