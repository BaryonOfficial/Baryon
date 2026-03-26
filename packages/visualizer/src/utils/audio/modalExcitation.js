import {
  sampleFFTAmplitudeForFrequency,
  getModalGeometryBackend,
} from "../../core/modalGeometryBackend.js";
import {
  blendColorStack,
  blendModalStack,
  countActiveSlots,
} from "./modalStack.js";
import { createBlendableLayerState } from "./blendState.js";

const BACKBONE_MAX_HZ = 3200;
const BACKBONE_MIN_HZ = 60;
const DETAIL_MAX_HZ = 12000;
const DETAIL_MIN_HZ = 200;
const BACKBONE_BINS_PER_OCTAVE = 5;
const DETAIL_BINS_PER_OCTAVE = 4;
const BACKBONE_FAMILY_WIDTH = 2;
const DETAIL_FAMILY_WIDTH = 3;
const MAX_SYNTH_PARTIALS = 14;
const SYNTH_BUFFER_SIZE = 1024;
const MIN_RESONATOR_AMPLITUDE = 0.0025;
const RESONATOR_MIN_DECAY_MS = 90;
const RESONATOR_MAX_DECAY_MS = 340;
const DRIVE_BLEND_ALPHA = 0.18;
const COHERENCE_BLEND_ALPHA = 0.16;
const PERSISTENCE_BLEND_ALPHA = 0.12;
const SATURATION_FACTOR = 0.85;
const CANONICAL_DRIVE_POINT = Object.freeze({
  x: 0.31,
  y: 0.43,
  z: 0.57,
});
const MODE_ATLAS_CACHE = new Map();
const MODE_ATLAS_CACHE_MAX_SIZE = 8;
const EXCITATION_BACKBONE_BLEND_ATTACK = 0.28;
const EXCITATION_BACKBONE_BLEND_TRACKING = 0.32;
const EXCITATION_BACKBONE_BLEND_RELEASE = 0.9;
const EXCITATION_BACKBONE_SILENCE_RELEASE = 0.82;
const EXCITATION_BACKBONE_HARD_SILENCE_RELEASE = 0.5;
const EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE_THRESHOLD = 0.08;
const EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE = 0.62;
const EXCITATION_BACKBONE_FRESH_CAP = 3;
const EXCITATION_DETAIL_BLEND_ATTACK = 0.45;
const EXCITATION_DETAIL_BLEND_TRACKING = 0.5;
const EXCITATION_DETAIL_BLEND_RELEASE = 0.68;
const EXCITATION_DETAIL_SILENCE_RELEASE = 0.58;
const EXCITATION_DETAIL_HARD_SILENCE_RELEASE = 0.42;
const EXCITATION_DETAIL_LOW_SIGNAL_RELEASE_THRESHOLD = 0.06;
const EXCITATION_DETAIL_LOW_SIGNAL_RELEASE = 0.48;
const EXCITATION_DETAIL_FRESH_CAP = 2;
const BACKBONE_SIGNAL_MIN_DRIVE_ENERGY = 0.045;
const DETAIL_SIGNAL_MIN_DRIVE_ENERGY = 0.05;
const BACKBONE_SIGNAL_STALE_WINDOW_MS = 66;
const DETAIL_SIGNAL_STALE_WINDOW_MS = 33;
const BACKBONE_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const BACKBONE_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.3;
const DETAIL_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const DETAIL_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.14;
const DETAIL_SIGNAL_SCORE_FRESHNESS_WEIGHT = 0.16;
const BACKBONE_DISPLAY_SCORE_DRIVE_WEIGHT = 0.42;
const BACKBONE_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.33;
const BACKBONE_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.17;
const BACKBONE_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.08;
const DETAIL_DISPLAY_SCORE_DRIVE_WEIGHT = 0.56;
const DETAIL_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.14;
const DETAIL_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.1;
const DETAIL_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.2;
const BACKBONE_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.08;
const DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.05;
const BACKBONE_DISPLAY_DUPLICATE_WINDOW = 0.09;
const DETAIL_DISPLAY_DUPLICATE_WINDOW = 0.06;
const BACKBONE_DISPLAY_MAX_VISIBLE = 6;
const DETAIL_DISPLAY_MAX_VISIBLE = 5;
const EXCITATION_DECAY_DRIVE_THRESHOLD = 0.065;
const EXCITATION_DECAY_SIGNAL_DISPLAY_RATIO = 0.55;
const EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE = 1;
const EXCITATION_HARD_SILENCE_MAX_RMS = 0.004;
const EXCITATION_HARD_SILENCE_MAX_FFT_PEAK = 0.003;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function createLayerBuffer(slotCount) {
  return {
    slots: new Float32Array(slotCount * 4),
    referenceSlots: new Float32Array(slotCount * 4),
    colorSlots: new Float32Array(slotCount * 4),
  };
}

function buildModeKey(u, v, w) {
  return `${u}:${v}:${w}`;
}

function getRelativeFrequencyDistance(leftHz, rightHz) {
  const safeLeft = Math.max(leftHz ?? 0, 1e-6);
  const safeRight = Math.max(rightHz ?? 0, 1e-6);
  return Math.abs(safeLeft - safeRight) / Math.max(safeLeft, safeRight);
}

function computeOrder(mode) {
  return (mode?.u ?? 0) + (mode?.v ?? 0) + (mode?.w ?? 0);
}

function buildFrequencyCenters(minHz, maxHz, binsPerOctave) {
  const centers = [];
  const multiplier = Math.pow(2, 1 / Math.max(1, binsPerOctave));
  let frequency = minHz;
  while (frequency <= maxHz) {
    centers.push(frequency);
    frequency *= multiplier;
  }
  if (centers[centers.length - 1] !== maxHz) {
    centers.push(maxHz);
  }
  return centers;
}

function canonicalDriveWeight(mode) {
  const wx = Math.abs(Math.sin(Math.PI * mode.u * CANONICAL_DRIVE_POINT.x));
  const wy = Math.abs(Math.sin(Math.PI * mode.v * CANONICAL_DRIVE_POINT.y));
  const wz = Math.abs(Math.sin(Math.PI * mode.w * CANONICAL_DRIVE_POINT.z));
  return clamp01(0.18 + (wx * wy * wz) / 0.82);
}

function computeDecayTauMs(mode) {
  const order = Math.max(1, computeOrder(mode));
  const tau = 310 / Math.sqrt(order * 0.75);
  return Math.max(
    RESONATOR_MIN_DECAY_MS,
    Math.min(RESONATOR_MAX_DECAY_MS, tau),
  );
}

function isHardSilentFrame(preparedInputs) {
  return (
    (preparedInputs?.avgAmplitude ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE &&
    (preparedInputs?.analyserRms ?? 0) <= EXCITATION_HARD_SILENCE_MAX_RMS &&
    (preparedInputs?.preModalFftPeak ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_FFT_PEAK
  );
}

function classifyModeLayer(naturalFrequencyHz, mode) {
  if (naturalFrequencyHz <= BACKBONE_MAX_HZ && computeOrder(mode) <= 24) {
    return "backbone";
  }

  return "detail";
}

function buildModeAtlas(radius, cavityGeometry = "rectangular") {
  const safeRadius = Math.max(0.1, Math.round(radius * 1000) / 1000);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const cacheKey = `${geometryBackend.cavityGeometry}:${safeRadius.toFixed(3)}`;
  if (MODE_ATLAS_CACHE.has(cacheKey)) {
    return MODE_ATLAS_CACHE.get(cacheKey);
  }
  const atlas = geometryBackend.buildAtlas({
    radius: safeRadius,
    frequencyCenters: [
      ...buildFrequencyCenters(
        BACKBONE_MIN_HZ,
        BACKBONE_MAX_HZ,
        BACKBONE_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: BACKBONE_FAMILY_WIDTH,
      })),
      ...buildFrequencyCenters(
        DETAIL_MIN_HZ,
        DETAIL_MAX_HZ,
        DETAIL_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: DETAIL_FAMILY_WIDTH,
      })),
    ],
    buildModeKey,
    createAtlasEntry({ candidate, modeKey, naturalFrequencyHz }) {
      const atlasEntry = {
        modeKey,
        familyId: `family:${modeKey}`,
        u: candidate.u,
        v: candidate.v,
        w: candidate.w,
        naturalFrequencyHz,
        order: computeOrder(candidate),
        driveWeight: canonicalDriveWeight(candidate),
        decayTauMs: computeDecayTauMs(candidate),
      };
      atlasEntry.layer = classifyModeLayer(naturalFrequencyHz, atlasEntry);
      return atlasEntry;
    },
  });
  MODE_ATLAS_CACHE.set(cacheKey, atlas);
  if (MODE_ATLAS_CACHE.size > MODE_ATLAS_CACHE_MAX_SIZE) {
    const oldestKey = MODE_ATLAS_CACHE.keys().next().value;
    MODE_ATLAS_CACHE.delete(oldestKey);
  }
  return atlas;
}

function buildDriveBufferFromTimeData(timeData) {
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return null;
  }

  const length = Math.min(SYNTH_BUFFER_SIZE, timeData.length);
  const buffer = new Float32Array(length);
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = timeData[index] ?? 0;
    buffer[index] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak <= 1e-6) {
    return null;
  }
  for (let index = 0; index < length; index += 1) {
    buffer[index] /= peak;
  }
  return { buffer, peak };
}

function buildDriveBufferFromSpectrum(fftMagnitudes, sampleRate) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return new Float32Array(SYNTH_BUFFER_SIZE);
  }

  const peaks = [];
  const nyquist = sampleRate * 0.5;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = fftMagnitudes[index] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    const frequency = (index / Math.max(1, fftMagnitudes.length)) * nyquist;
    peaks.push({ frequency, amplitude });
  }
  peaks.sort((left, right) => right.amplitude - left.amplitude);
  const selected = peaks.slice(0, MAX_SYNTH_PARTIALS);
  const buffer = new Float32Array(SYNTH_BUFFER_SIZE);
  const amplitudeNorm = selected[0]?.amplitude ?? 1;

  for (let index = 0; index < buffer.length; index += 1) {
    const t = index / sampleRate;
    let sample = 0;
    for (let peakIndex = 0; peakIndex < selected.length; peakIndex += 1) {
      const peak = selected[peakIndex];
      const partialAmplitude = peak.amplitude / Math.max(amplitudeNorm, 1e-6);
      const phaseOffset = peakIndex * 0.41;
      sample +=
        Math.sin(2 * Math.PI * peak.frequency * t + phaseOffset) *
        partialAmplitude;
    }
    buffer[index] = selected.length > 0 ? sample / selected.length : 0;
  }

  return buffer;
}

function computeDriveBuffer(preparedInputs, fastSignalState) {
  const timeDomainResult = buildDriveBufferFromTimeData(
    preparedInputs.snapshot?.timeData,
  );
  if (timeDomainResult) {
    return {
      buffer: timeDomainResult.buffer,
      peak: timeDomainResult.peak,
      driveSource: "time-domain",
    };
  }

  return {
    buffer: buildDriveBufferFromSpectrum(
      fastSignalState.fftMagnitudes,
      preparedInputs.sampleRate,
    ),
    peak: 1,
    driveSource: "spectral-fallback",
  };
}

function computeSpectralFlatness(fftMagnitudes) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return 1;
  }

  let logSum = 0;
  let linearSum = 0;
  let count = 0;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = Math.max(1e-6, fftMagnitudes[index] ?? 0);
    logSum += Math.log(amplitude);
    linearSum += amplitude;
    count += 1;
  }
  if (count === 0 || linearSum <= 0) {
    return 1;
  }

  return clamp01(Math.exp(logSum / count) / (linearSum / count));
}

function computeDrivePeriodicity(buffer, sampleRate) {
  if (!(buffer instanceof Float32Array) || buffer.length < 32) {
    return 0;
  }

  const minLag = Math.max(2, Math.floor(sampleRate / 1200));
  const maxLag = Math.min(buffer.length - 2, Math.floor(sampleRate / 60));
  if (maxLag <= minLag) {
    return 0;
  }

  const prefixSumSq = new Float64Array(buffer.length + 1);
  for (let index = 0; index < buffer.length; index += 1) {
    prefixSumSq[index + 1] = prefixSumSq[index] + buffer[index] * buffer[index];
  }
  const totalEnergy = prefixSumSq[buffer.length];
  if (totalEnergy <= 1e-6) {
    return 0;
  }

  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    const overlapLength = buffer.length - lag;
    for (let index = 0; index < overlapLength; index += 1) {
      correlation += buffer[index] * buffer[index + lag];
    }
    const overlapEnergy = prefixSumSq[overlapLength];
    if (overlapEnergy > 1e-6) {
      best = Math.max(best, correlation / overlapEnergy);
    }
  }

  return clamp01(best);
}

function computeModeResponse(buffer, sampleRate, frequencyHz) {
  if (
    !(buffer instanceof Float32Array) ||
    buffer.length === 0 ||
    frequencyHz <= 0
  ) {
    return { magnitude: 0, phase: 0 };
  }

  let real = 0;
  let imag = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const theta = (2 * Math.PI * frequencyHz * index) / sampleRate;
    const sample = buffer[index] ?? 0;
    real += sample * Math.cos(theta);
    imag -= sample * Math.sin(theta);
  }

  const magnitude = Math.hypot(real, imag) / Math.max(1, buffer.length);
  return {
    magnitude: clamp01(magnitude * 2.6),
    phase: Math.atan2(imag, real),
  };
}

function pitchClassHue(frequencyHz) {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return 0;
  }
  const midi = 69 + 12 * Math.log2(frequencyHz / 440);
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
  return pitchClass / 12;
}

function hueToRgb(hue, saturation = 0.7, lightness = 0.58) {
  const h = ((hue % 1) + 1) % 1;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const sample = (t) => {
    let local = t;
    if (local < 0) local += 1;
    if (local > 1) local -= 1;
    if (local < 1 / 6) return p + (q - p) * 6 * local;
    if (local < 1 / 2) return q;
    if (local < 2 / 3) return p + (q - p) * (2 / 3 - local) * 6;
    return p;
  };
  return {
    r: sample(h + 1 / 3),
    g: sample(h),
    b: sample(h - 1 / 3),
  };
}

function clearLayerBuffers(layerBuffer) {
  layerBuffer.slots.fill(0);
  layerBuffer.referenceSlots.fill(0);
  layerBuffer.colorSlots.fill(0);
}

function sumSlotAmplitudes(slots) {
  if (!(slots instanceof Float32Array) || slots.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 3; index < slots.length; index += 4) {
    total += slots[index] ?? 0;
  }

  return total;
}

function isWeakResidualDisplayTail({
  modalDriveEnergy,
  signalAmplitudeTotal,
  displayAmplitudeTotal,
}) {
  return (
    modalDriveEnergy <= EXCITATION_DECAY_DRIVE_THRESHOLD &&
    signalAmplitudeTotal > 0 &&
    signalAmplitudeTotal <=
      displayAmplitudeTotal * EXCITATION_DECAY_SIGNAL_DISPLAY_RATIO
  );
}

function remapReferenceToBlendedOrder(
  blendedSlots,
  rawReferenceSlots,
  capacity,
  output,
) {
  output.fill(0);

  const blendedLimit = Math.min(
    capacity,
    Math.floor((blendedSlots?.length ?? 0) / 4),
  );
  const rawLimit = Math.min(
    capacity,
    Math.floor((rawReferenceSlots?.length ?? 0) / 4),
  );

  for (let index = 0; index < blendedLimit; index += 1) {
    const offset = index * 4;
    const blendedAmplitude = blendedSlots[offset + 3] ?? 0;
    if (blendedAmplitude <= 0) {
      continue;
    }

    const u = blendedSlots[offset];
    const v = blendedSlots[offset + 1];
    const w = blendedSlots[offset + 2];
    output[offset] = u;
    output[offset + 1] = v;
    output[offset + 2] = w;

    for (
      let referenceIndex = 0;
      referenceIndex < rawLimit;
      referenceIndex += 1
    ) {
      const referenceOffset = referenceIndex * 4;
      const referenceAmplitude = rawReferenceSlots[referenceOffset + 3] ?? 0;
      if (
        referenceAmplitude > 0 &&
        rawReferenceSlots[referenceOffset] === u &&
        rawReferenceSlots[referenceOffset + 1] === v &&
        rawReferenceSlots[referenceOffset + 2] === w
      ) {
        output[offset + 3] = referenceAmplitude;
        break;
      }
    }
  }
}

function writeLayerEntry(layerBuffer, index, entry, referenceAmplitude) {
  const offset = index * 4;
  layerBuffer.slots[offset] = entry.u;
  layerBuffer.slots[offset + 1] = entry.v;
  layerBuffer.slots[offset + 2] = entry.w;
  layerBuffer.slots[offset + 3] = entry.signalAmplitude ?? entry.amplitude;
  layerBuffer.referenceSlots[offset] = entry.u;
  layerBuffer.referenceSlots[offset + 1] = entry.v;
  layerBuffer.referenceSlots[offset + 2] = entry.w;
  layerBuffer.referenceSlots[offset + 3] = referenceAmplitude;
  const color = hueToRgb(pitchClassHue(entry.naturalFrequencyHz));
  layerBuffer.colorSlots[offset] = color.r;
  layerBuffer.colorSlots[offset + 1] = color.g;
  layerBuffer.colorSlots[offset + 2] = color.b;
  layerBuffer.colorSlots[offset + 3] = clamp01(0.3 + entry.coherence * 0.7);
}

function writeShortlistedEntries(
  layerBuffer,
  entries,
  capacity,
  selectReference,
) {
  // The shortlist is already term-based: one shortlisted entry writes one slot,
  // and capacity is enforced in slot units rather than family units.
  const slotLimit = Math.min(
    capacity,
    entries.length,
    Math.floor((layerBuffer?.slots?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotLimit; index += 1) {
    const entry = entries[index];
    writeLayerEntry(layerBuffer, index, entry, selectReference(entry));
  }
  return slotLimit;
}

function buildHarmonicSupport(entries, dominantFrequencyHz) {
  const support = new Float32Array(6);
  if (!dominantFrequencyHz || entries.length === 0) {
    return support;
  }

  for (let harmonic = 1; harmonic <= support.length; harmonic += 1) {
    const targetFrequency = dominantFrequencyHz * harmonic;
    let best = 0;
    for (const entry of entries) {
      const relativeError =
        Math.abs(entry.naturalFrequencyHz - targetFrequency) /
        Math.max(targetFrequency, 1);
      const match =
        clamp01(1 - relativeError * 10) * entry.amplitude * entry.coherence;
      best = Math.max(best, match);
    }
    support[harmonic - 1] = clamp01(best);
  }

  return support;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function getFreshness(entry) {
  return 1 - (entry?.persistence ?? 0);
}

function getSignalScore(entry, layer) {
  const coherence = clamp01(entry?.coherence ?? 0);
  const driveEnergy = entry?.currentDriveEnergy ?? entry?.driveEnergy ?? 0;
  const amplitude = entry?.amplitude ?? 0;
  const freshness = getFreshness(entry);

  if (layer === "detail") {
    return (
      (driveEnergy * DETAIL_SIGNAL_SCORE_DRIVE_WEIGHT +
        amplitude * DETAIL_SIGNAL_SCORE_AMPLITUDE_WEIGHT +
        freshness * DETAIL_SIGNAL_SCORE_FRESHNESS_WEIGHT) *
      clamp01(0.45 + coherence * 0.55)
    );
  }

  return (
    coherence *
    (driveEnergy * BACKBONE_SIGNAL_SCORE_DRIVE_WEIGHT +
      amplitude * BACKBONE_SIGNAL_SCORE_AMPLITUDE_WEIGHT)
  );
}

function buildSignalShortlist(entries, layer, currentFrameAtMs, capacity) {
  const coherenceThreshold = layer === "backbone" ? 0.08 : 0.05;
  const driveThreshold =
    layer === "backbone"
      ? BACKBONE_SIGNAL_MIN_DRIVE_ENERGY
      : DETAIL_SIGNAL_MIN_DRIVE_ENERGY;
  const staleWindowMs =
    layer === "backbone"
      ? BACKBONE_SIGNAL_STALE_WINDOW_MS
      : DETAIL_SIGNAL_STALE_WINDOW_MS;

  return entries
    .filter((entry) => {
      if (entry.layer !== layer || entry.coherence < coherenceThreshold) {
        return false;
      }
      if (
        (entry.currentDriveEnergy ?? entry.driveEnergy ?? 0) >= driveThreshold
      ) {
        return true;
      }
      return (
        currentFrameAtMs -
          (entry.lastExcitedAtMs ?? Number.NEGATIVE_INFINITY) <=
        staleWindowMs
      );
    })
    .map((entry) => ({
      entry,
      score: getSignalScore(entry, layer),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (
        (right.entry.currentDriveEnergy ?? right.entry.driveEnergy ?? 0) !==
        (left.entry.currentDriveEnergy ?? left.entry.driveEnergy ?? 0)
      ) {
        return (
          (right.entry.currentDriveEnergy ?? right.entry.driveEnergy ?? 0) -
          (left.entry.currentDriveEnergy ?? left.entry.driveEnergy ?? 0)
        );
      }
      return (right.entry.amplitude ?? 0) - (left.entry.amplitude ?? 0);
    })
    .slice(0, capacity)
    .map(({ entry, score }) => ({
      ...entry,
      signalAmplitude: clamp01(score),
    }));
}

function getDisplayScore(entry, layer) {
  const driveEnergy = entry?.currentDriveEnergy ?? 0;
  const coherence = entry?.coherence ?? 0;
  const amplitude = entry?.amplitude ?? 0;
  const freshness = getFreshness(entry);

  if (layer === "backbone") {
    return (
      driveEnergy * BACKBONE_DISPLAY_SCORE_DRIVE_WEIGHT +
      coherence * BACKBONE_DISPLAY_SCORE_COHERENCE_WEIGHT +
      amplitude * BACKBONE_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
      freshness * BACKBONE_DISPLAY_SCORE_FRESHNESS_WEIGHT
    );
  }

  return (
    driveEnergy * DETAIL_DISPLAY_SCORE_DRIVE_WEIGHT +
    coherence * DETAIL_DISPLAY_SCORE_COHERENCE_WEIGHT +
    amplitude * DETAIL_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
    freshness * DETAIL_DISPLAY_SCORE_FRESHNESS_WEIGHT
  );
}

function compareFastDetailAssistEntries(left, right) {
  const driveDelta =
    (right?.currentDriveEnergy ?? 0) - (left?.currentDriveEnergy ?? 0);
  if (Math.abs(driveDelta) > 1e-9) {
    return driveDelta;
  }

  const freshnessDelta = getFreshness(right) - getFreshness(left);
  if (Math.abs(freshnessDelta) > 1e-9) {
    return freshnessDelta;
  }

  return (right?.signalAmplitude ?? 0) - (left?.signalAmplitude ?? 0);
}

function selectFastDetailAssist(entries, currentFrameAtMs) {
  return (
    entries
      .filter((entry) => {
        if ((entry?.layer ?? "detail") !== "detail") {
          return false;
        }

        return (
          (entry?.currentDriveEnergy ?? 0) >= 0.12 &&
          (entry?.signalAmplitude ?? 0) >=
            DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE &&
          currentFrameAtMs -
            (entry?.lastExcitedAtMs ?? Number.NEGATIVE_INFINITY) <=
            DETAIL_SIGNAL_STALE_WINDOW_MS &&
          (entry?.persistence ?? 1) <= 0.72
        );
      })
      .sort(compareFastDetailAssistEntries)[0] ?? null
  );
}

function mergeFastDetailAssist(displayEntries, assistEntry) {
  const visibleEntries = displayEntries.slice(0, DETAIL_DISPLAY_MAX_VISIBLE);
  if (!assistEntry) {
    return {
      entries: visibleEntries,
      assistEntry: null,
      assistNeedsReservedAdmission: false,
    };
  }

  const mergedEntries = [...visibleEntries];
  const duplicateIndex = mergedEntries.findIndex(
    (entry) =>
      getRelativeFrequencyDistance(
        entry.naturalFrequencyHz,
        assistEntry.naturalFrequencyHz,
      ) <= DETAIL_DISPLAY_DUPLICATE_WINDOW,
  );

  if (duplicateIndex === -1) {
    return {
      entries: [
        assistEntry,
        ...mergedEntries.filter(
          (entry) => entry.modeKey !== assistEntry.modeKey,
        ),
      ].slice(0, DETAIL_DISPLAY_MAX_VISIBLE),
      assistEntry,
      assistNeedsReservedAdmission: true,
    };
  }

  const duplicateEntry = mergedEntries[duplicateIndex];
  if (compareFastDetailAssistEntries(assistEntry, duplicateEntry) >= 0) {
    return {
      entries: visibleEntries,
      assistEntry: null,
      assistNeedsReservedAdmission: false,
    };
  }

  mergedEntries.splice(duplicateIndex, 1, assistEntry);
  return {
    entries: [
      assistEntry,
      ...mergedEntries.filter((entry) => entry.modeKey !== assistEntry.modeKey),
    ].slice(0, DETAIL_DISPLAY_MAX_VISIBLE),
    assistEntry,
    assistNeedsReservedAdmission:
      duplicateEntry?.modeKey !== assistEntry.modeKey,
  };
}

function hasVisibleModeKey(slots, modeKey) {
  if (!modeKey || !(slots instanceof Float32Array)) {
    return false;
  }

  for (let index = 0; index < slots.length; index += 4) {
    if ((slots[index + 3] ?? 0) <= 0) {
      continue;
    }
    if (
      buildModeKey(slots[index], slots[index + 1], slots[index + 2]) === modeKey
    ) {
      return true;
    }
  }

  return false;
}

function buildDisplayShortlist(entries, layer) {
  const minSignalAmplitude =
    layer === "backbone"
      ? BACKBONE_DISPLAY_MIN_SIGNAL_AMPLITUDE
      : DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE;
  const duplicateWindow =
    layer === "backbone"
      ? BACKBONE_DISPLAY_DUPLICATE_WINDOW
      : DETAIL_DISPLAY_DUPLICATE_WINDOW;
  const visibleCap =
    layer === "backbone"
      ? BACKBONE_DISPLAY_MAX_VISIBLE
      : DETAIL_DISPLAY_MAX_VISIBLE;

  const ranked = entries
    .filter((entry) => (entry?.signalAmplitude ?? 0) >= minSignalAmplitude)
    .map((entry) => ({
      ...entry,
      displayScore: getDisplayScore(entry, layer),
    }))
    .sort((left, right) => {
      if (right.displayScore !== left.displayScore) {
        return right.displayScore - left.displayScore;
      }
      return (right.signalAmplitude ?? 0) - (left.signalAmplitude ?? 0);
    });

  const survivors = [];
  for (const entry of ranked) {
    if (
      survivors.some(
        (survivor) =>
          getRelativeFrequencyDistance(
            survivor.naturalFrequencyHz,
            entry.naturalFrequencyHz,
          ) <= duplicateWindow,
      )
    ) {
      continue;
    }
    survivors.push(entry);
    if (survivors.length >= visibleCap) {
      break;
    }
  }

  return survivors;
}

function createLayerStateSummary(entries, periodicity, tonalness, layer) {
  const dominant = entries[0] ?? null;
  const harmonicSupport = buildHarmonicSupport(
    entries,
    layer === "backbone" ? (dominant?.naturalFrequencyHz ?? 0) : 0,
  );
  return {
    uniqueModeCount: entries.length,
    harmonicSupport,
    fundamental: dominant?.naturalFrequencyHz ?? 0,
    fundamentalConfidence: dominant?.coherence ?? 0,
    analysisEngine: "modal-excitation",
    driverFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateConfidence: dominant?.coherence ?? 0,
    candidateFrames: Math.round((dominant?.ageMs ?? 0) / 33),
    candidatePeriodicity: periodicity,
    candidateHarmonicSupport: average(Array.from(harmonicSupport)),
    candidateDirectSupport: dominant?.driveEnergy ?? 0,
    candidateLowEnergy: (dominant?.amplitude ?? 0) < 0.08,
    voicingActive: periodicity > 0.25 && tonalness > 0.2,
    highCandidateRejected: false,
    rejectionReason: "none",
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
    chromesthesiaComponents: entries.slice(0, 6).map((entry) => ({
      frequency: entry.naturalFrequencyHz,
      weight: entry.amplitude * Math.max(0.2, entry.coherence),
      color: hueToRgb(pitchClassHue(entry.naturalFrequencyHz)),
    })),
  };
}

function computeComparisonMetrics(primaryState, comparisonState) {
  const primaryFreq = primaryState?.dominantFrequency ?? 0;
  const comparisonFreq = comparisonState?.dominantFrequency ?? 0;
  const dominantFrequencyRatio =
    primaryFreq > 0 && comparisonFreq > 0
      ? Math.log2(comparisonFreq / primaryFreq)
      : 0;
  return {
    activeModeCountDelta:
      (comparisonState?.activeModeCount ?? 0) -
      (primaryState?.activeModeCount ?? 0),
    dominantFrequencyRatio,
    dominantFrequencyDeltaCents: dominantFrequencyRatio * 1200,
    modeCoherenceDelta:
      (comparisonState?.structuralMetrics?.modeCoherence ?? 0) -
      (primaryState?.structuralMetrics?.modeCoherence ?? 0),
  };
}

export function getAtlasCacheSize() {
  return MODE_ATLAS_CACHE.size;
}

export { computeDrivePeriodicity };

export function createModalExcitationState(capacity = 16) {
  const layerCapacity = Math.min(capacity, 8);
  return {
    capacity,
    activeModes: new Map(),
    atlasCacheKey: null,
    atlasEntries: [],
    backbone: createLayerBuffer(layerCapacity),
    detail: createLayerBuffer(layerCapacity),
    displayBackbone: createLayerBuffer(layerCapacity),
    displayDetail: createLayerBuffer(layerCapacity),
    blendBackbone: createBlendableLayerState(layerCapacity),
    blendDetail: createBlendableLayerState(layerCapacity),
    remappedBackboneRef: new Float32Array(layerCapacity * 4),
    remappedDetailRef: new Float32Array(layerCapacity * 4),
    remappedSignalBackboneRef: new Float32Array(layerCapacity * 4),
    remappedSignalDetailRef: new Float32Array(layerCapacity * 4),
    previousSignalBackboneSlots: new Float32Array(layerCapacity * 4),
    previousSignalDetailSlots: new Float32Array(layerCapacity * 4),
    diagnostics: {
      excitedModeCount: 0,
      distributedExcitation: 0,
      lowOrderModalEnergy: 0,
      highOrderModalEnergy: 0,
      modalPersistence: 0,
      modalDriveEnergy: 0,
      modeCoherence: 0,
      driveSource: "spectral-fallback",
    },
  };
}

export function compareStructuralStates(primaryState, comparisonState) {
  return computeComparisonMetrics(primaryState, comparisonState);
}

export function buildModalExcitationStructuralState({
  preparedInputs,
  fastSignalState,
  existingState,
  performanceNow = () => 0,
}) {
  const state =
    existingState && existingState.capacity === preparedInputs.capacity
      ? existingState
      : createModalExcitationState(preparedInputs.capacity);
  const atlas = buildModeAtlas(
    preparedInputs.radius,
    preparedInputs.effectiveCavityGeometry,
  );
  state.atlasEntries = atlas;
  state.atlasCacheKey = `${
    preparedInputs.effectiveCavityGeometry
  }:${preparedInputs.radius}`;
  clearLayerBuffers(state.backbone);
  clearLayerBuffers(state.detail);
  clearLayerBuffers(state.displayBackbone);
  clearLayerBuffers(state.displayDetail);

  const startedAt = performanceNow();
  const {
    buffer: driveBuffer,
    peak: drivePeak,
    driveSource,
  } = computeDriveBuffer(preparedInputs, fastSignalState);
  const hardSilentFrame = isHardSilentFrame(preparedInputs);
  const periodicity = computeDrivePeriodicity(
    driveBuffer,
    preparedInputs.sampleRate,
  );
  const flatness = computeSpectralFlatness(fastSignalState.fftMagnitudes);
  const tonalness = clamp01(1 - flatness * 1.1);
  const distributedExcitation = clamp01(
    fastSignalState.trebleBroadbandEnergy * 0.62 + flatness * 0.38,
  );
  const deltaMs = Math.max(
    16,
    preparedInputs.currentFrameAtMs -
      (state.lastFrameAtMs ?? preparedInputs.currentFrameAtMs - 16),
  );
  state.lastFrameAtMs = preparedInputs.currentFrameAtMs;

  const nextModes = new Map();
  const excitedEntries = [];
  let lowOrderModalEnergy = 0;
  let highOrderModalEnergy = 0;
  let driveEnergyTotal = 0;
  let persistenceTotal = 0;
  let coherenceTotal = 0;

  for (const atlasEntry of atlas) {
    const response = computeModeResponse(
      driveBuffer,
      preparedInputs.sampleRate,
      atlasEntry.naturalFrequencyHz,
    );
    const spectralSupport = sampleFFTAmplitudeForFrequency(
      atlasEntry.naturalFrequencyHz,
      fastSignalState.fftMagnitudes,
      preparedInputs.sampleRate,
      preparedInputs.fftSize,
    );
    const driveEnergy =
      drivePeak < 0.005
        ? 0
        : clamp01(
            response.magnitude * drivePeak * 1.9 +
              spectralSupport * 0.85 +
              fastSignalState.transientEnergy * 0.08,
          );
    const coherenceTarget = clamp01(
      tonalness * 0.45 +
        periodicity * 0.4 +
        atlasEntry.driveWeight * 0.15 -
        distributedExcitation * 0.24,
    );
    const previous = state.activeModes.get(atlasEntry.modeKey) ?? null;
    const decay = Math.exp(-deltaMs / atlasEntry.decayTauMs);
    const carriedAmplitude = (previous?.amplitude ?? 0) * decay;
    const injectedAmplitude =
      driveEnergy *
      atlasEntry.driveWeight *
      (atlasEntry.layer === "backbone" ? 0.92 : 0.78) *
      (0.35 + coherenceTarget * 0.65);
    const rawAmplitude =
      carriedAmplitude +
      injectedAmplitude * (1 - carriedAmplitude * SATURATION_FACTOR);
    const amplitude = clamp01(rawAmplitude);
    if (amplitude < MIN_RESONATOR_AMPLITUDE) {
      continue;
    }

    const coherence = clamp01(
      (previous?.coherence ?? coherenceTarget) * (1 - COHERENCE_BLEND_ALPHA) +
        coherenceTarget * COHERENCE_BLEND_ALPHA,
    );
    const persistenceTarget =
      amplitude > 1e-6 ? clamp01(carriedAmplitude / amplitude) : 0;
    const persistence = clamp01(
      (previous?.persistence ?? persistenceTarget) *
        (1 - PERSISTENCE_BLEND_ALPHA) +
        persistenceTarget * PERSISTENCE_BLEND_ALPHA,
    );
    const entry = {
      ...atlasEntry,
      amplitude,
      currentDriveEnergy: driveEnergy,
      driveEnergy:
        (previous?.driveEnergy ?? driveEnergy) * (1 - DRIVE_BLEND_ALPHA) +
        driveEnergy * DRIVE_BLEND_ALPHA,
      phase: response.phase,
      coherence,
      persistence,
      lastExcitedAtMs:
        driveEnergy > MIN_RESONATOR_AMPLITUDE
          ? preparedInputs.currentFrameAtMs
          : (previous?.lastExcitedAtMs ?? preparedInputs.currentFrameAtMs),
      ageMs: (previous?.ageMs ?? 0) + deltaMs,
    };
    nextModes.set(entry.modeKey, entry);
    excitedEntries.push(entry);
    driveEnergyTotal += entry.driveEnergy;
    persistenceTotal += entry.persistence;
    coherenceTotal += entry.coherence;
    if (entry.layer === "backbone") {
      lowOrderModalEnergy += entry.amplitude;
    } else {
      highOrderModalEnergy += entry.amplitude;
    }
  }

  state.activeModes = nextModes;
  excitedEntries.sort(
    (left, right) =>
      right.amplitude * Math.max(0.15, right.coherence) -
      left.amplitude * Math.max(0.15, left.coherence),
  );

  const backboneCapacity = state.backbone.slots.length / 4;
  const detailCapacity = state.detail.slots.length / 4;
  const backboneEntries = buildSignalShortlist(
    excitedEntries,
    "backbone",
    preparedInputs.currentFrameAtMs,
    backboneCapacity,
  );
  const detailEntries = buildSignalShortlist(
    excitedEntries,
    "detail",
    preparedInputs.currentFrameAtMs,
    detailCapacity,
  );
  const fastDetailAssist = selectFastDetailAssist(
    detailEntries,
    preparedInputs.currentFrameAtMs,
  );
  const displayBackboneEntries = hardSilentFrame
    ? []
    : buildDisplayShortlist(backboneEntries, "backbone");
  const {
    entries: displayDetailEntries,
    assistEntry: mergedFastDetailAssist,
    assistNeedsReservedAdmission,
  } = hardSilentFrame
    ? {
        entries: [],
        assistEntry: null,
        assistNeedsReservedAdmission: false,
      }
    : mergeFastDetailAssist(
        buildDisplayShortlist(detailEntries, "detail"),
        fastDetailAssist,
      );

  writeShortlistedEntries(
    state.backbone,
    backboneEntries,
    backboneCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
  );
  writeShortlistedEntries(
    state.detail,
    detailEntries,
    detailCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
  );
  writeShortlistedEntries(
    state.displayBackbone,
    displayBackboneEntries,
    backboneCapacity,
    (entry) => entry.signalAmplitude ?? 0,
  );
  writeShortlistedEntries(
    state.displayDetail,
    displayDetailEntries,
    detailCapacity,
    (entry) => entry.signalAmplitude ?? 0,
  );

  blendModalStack(
    state.blendBackbone,
    state.displayBackbone.slots,
    backboneCapacity,
    {
      attack: EXCITATION_BACKBONE_BLEND_ATTACK,
      tracking: EXCITATION_BACKBONE_BLEND_TRACKING,
      release: EXCITATION_BACKBONE_BLEND_RELEASE,
      emptyTargetRelease: hardSilentFrame
        ? EXCITATION_BACKBONE_HARD_SILENCE_RELEASE
        : EXCITATION_BACKBONE_SILENCE_RELEASE,
      lowSignalReleaseThreshold:
        EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE_THRESHOLD,
      lowSignalRelease: EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE,
      freshCap: EXCITATION_BACKBONE_FRESH_CAP,
    },
  );
  const detailAssistNeedsFreshAdmission =
    assistNeedsReservedAdmission &&
    mergedFastDetailAssist &&
    !hasVisibleModeKey(state.blendDetail.slots, mergedFastDetailAssist.modeKey);
  blendModalStack(
    state.blendDetail,
    state.displayDetail.slots,
    detailCapacity,
    {
      attack: EXCITATION_DETAIL_BLEND_ATTACK,
      tracking: EXCITATION_DETAIL_BLEND_TRACKING,
      release: EXCITATION_DETAIL_BLEND_RELEASE,
      emptyTargetRelease: hardSilentFrame
        ? EXCITATION_DETAIL_HARD_SILENCE_RELEASE
        : EXCITATION_DETAIL_SILENCE_RELEASE,
      lowSignalReleaseThreshold: EXCITATION_DETAIL_LOW_SIGNAL_RELEASE_THRESHOLD,
      lowSignalRelease: EXCITATION_DETAIL_LOW_SIGNAL_RELEASE,
      freshCap:
        EXCITATION_DETAIL_FRESH_CAP + (detailAssistNeedsFreshAdmission ? 1 : 0),
    },
  );

  if (preparedInputs.shouldBuildChromesthesia) {
    blendColorStack(
      state.blendBackbone,
      state.displayBackbone.slots,
      state.displayBackbone.colorSlots,
      backboneCapacity,
      {
        attack: EXCITATION_BACKBONE_BLEND_ATTACK,
        tracking: EXCITATION_BACKBONE_BLEND_TRACKING,
        release: EXCITATION_BACKBONE_BLEND_RELEASE,
      },
    );
    blendColorStack(
      state.blendDetail,
      state.displayDetail.slots,
      state.displayDetail.colorSlots,
      detailCapacity,
      {
        attack: EXCITATION_DETAIL_BLEND_ATTACK,
        tracking: EXCITATION_DETAIL_BLEND_TRACKING,
        release: EXCITATION_DETAIL_BLEND_RELEASE,
      },
    );
  }

  remapReferenceToBlendedOrder(
    state.blendBackbone.slots,
    state.displayBackbone.referenceSlots,
    backboneCapacity,
    state.remappedBackboneRef,
  );
  remapReferenceToBlendedOrder(
    state.blendDetail.slots,
    state.displayDetail.referenceSlots,
    detailCapacity,
    state.remappedDetailRef,
  );
  remapReferenceToBlendedOrder(
    state.backbone.slots,
    state.previousSignalBackboneSlots,
    backboneCapacity,
    state.remappedSignalBackboneRef,
  );
  remapReferenceToBlendedOrder(
    state.detail.slots,
    state.previousSignalDetailSlots,
    detailCapacity,
    state.remappedSignalDetailRef,
  );

  const blendedBackboneCount = countActiveSlots(
    state.blendBackbone.slots,
    backboneCapacity,
  );
  const blendedDetailCount = countActiveSlots(
    state.blendDetail.slots,
    detailCapacity,
  );
  const signalBackboneCount = countActiveSlots(
    state.backbone.slots,
    backboneCapacity,
  );
  const signalDetailCount = countActiveSlots(
    state.detail.slots,
    detailCapacity,
  );
  const modalDriveEnergy = excitedEntries.length
    ? clamp01(driveEnergyTotal / excitedEntries.length)
    : 0;
  const displayAmplitudeTotal =
    sumSlotAmplitudes(state.blendBackbone.slots) +
    sumSlotAmplitudes(state.blendDetail.slots);
  const signalAmplitudeTotal =
    sumSlotAmplitudes(state.backbone.slots) +
    sumSlotAmplitudes(state.detail.slots);
  const weakResidualSignal = isWeakResidualDisplayTail({
    modalDriveEnergy,
    signalAmplitudeTotal,
    displayAmplitudeTotal,
  });

  state.previousSignalBackboneSlots.fill(0);
  state.previousSignalBackboneSlots.set(
    state.backbone.slots.subarray(0, state.previousSignalBackboneSlots.length),
  );
  state.previousSignalDetailSlots.fill(0);
  state.previousSignalDetailSlots.set(
    state.detail.slots.subarray(0, state.previousSignalDetailSlots.length),
  );

  const dominantEntry = excitedEntries[0] ?? null;
  const backboneStateSource = createLayerStateSummary(
    backboneEntries,
    periodicity,
    tonalness,
    "backbone",
  );
  const detailStateSource = createLayerStateSummary(
    detailEntries,
    periodicity,
    tonalness,
    "detail",
  );
  const diagnostics = {
    excitedModeCount: excitedEntries.length,
    distributedExcitation,
    lowOrderModalEnergy,
    highOrderModalEnergy,
    modalPersistence: excitedEntries.length
      ? clamp01(persistenceTotal / excitedEntries.length)
      : 0,
    modalDriveEnergy,
    modeCoherence: excitedEntries.length
      ? clamp01(coherenceTotal / excitedEntries.length)
      : 0,
    driveSource,
  };
  state.diagnostics = diagnostics;

  return {
    sourceMode: preparedInputs.sourceMode,
    backboneSlotsSource: state.blendBackbone.slots,
    detailSlotsSource: state.blendDetail.slots,
    referenceBackboneSlotsSource: state.remappedBackboneRef,
    referenceDetailSlotsSource: state.remappedDetailRef,
    signalBackboneSlotsSource: state.backbone.slots,
    signalDetailSlotsSource: state.detail.slots,
    signalReferenceBackboneSlotsSource: state.remappedSignalBackboneRef,
    signalReferenceDetailSlotsSource: state.remappedSignalDetailRef,
    backboneColorSlotsSource: preparedInputs.shouldBuildChromesthesia
      ? state.blendBackbone.colorSlots
      : null,
    detailColorSlotsSource: preparedInputs.shouldBuildChromesthesia
      ? state.blendDetail.colorSlots
      : null,
    backboneStateSource,
    detailStateSource,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    activeBackboneModeCount: blendedBackboneCount,
    activeDetailModeCount: blendedDetailCount,
    activeModeCount: blendedBackboneCount + blendedDetailCount,
    dominantFrequency: dominantEntry?.naturalFrequencyHz ?? 0,
    dominantAmplitude: dominantEntry?.amplitude ?? 0,
    analysisEngine: "modal-excitation",
    pitchSource: "resonator-bank",
    spectralCandidates: [],
    usedDecay:
      blendedBackboneCount + blendedDetailCount > 0 &&
      (signalBackboneCount + signalDetailCount === 0 || weakResidualSignal),
    suppressedByFog: false,
    structuralPerf: {
      peakScanMs: 0,
      modalResolveMs: Math.max(0, performanceNow() - startedAt),
      projectionMs: 0,
    },
    structuralMetrics: diagnostics,
  };
}
