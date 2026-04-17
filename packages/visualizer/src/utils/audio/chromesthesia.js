const NOTE_NAMES = Object.freeze([
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
]);

const PITCH_CLASS_HUES = Object.freeze([
  0 / 12,
  1 / 12,
  2 / 12,
  3 / 12,
  4 / 12,
  5 / 12,
  6 / 12,
  7 / 12,
  8 / 12,
  9 / 12,
  10 / 12,
  11 / 12,
]);

const LOW_OCTAVE = 2;
const HIGH_OCTAVE = 6;
const MIN_VALUE = 0.35;
const MAX_VALUE = 0.95;
const MIN_SATURATION = 0.3;
const MAX_SATURATION = 0.95;
const WEAK_COMPONENT_FLOOR = 0.24;
const FAMILY_DISTANCE_SEMITONES = 1.15;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function hsvToRgb(h, s, v) {
  const hue = mod(h, 1) * 6;
  const sector = Math.floor(hue);
  const fraction = hue - sector;
  const p = v * (1 - s);
  const q = v * (1 - fraction * s);
  const t = v * (1 - (1 - fraction) * s);

  switch (sector % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    default:
      return { r: v, g: p, b: q };
  }
}

function frequencyToMidi(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  return 69 + 12 * Math.log2(frequency / 440);
}

export function getPitchClassForFrequency(frequency) {
  const midi = frequencyToMidi(frequency);
  if (midi == null) return null;
  return mod(Math.round(midi), 12);
}

function getOctaveForFrequency(frequency) {
  const midi = frequencyToMidi(frequency);
  if (midi == null) return null;
  return Math.floor(Math.round(midi) / 12) - 1;
}

export function getNoteNameForFrequency(frequency) {
  const pitchClass = getPitchClassForFrequency(frequency);
  if (pitchClass == null) return null;
  return NOTE_NAMES[pitchClass];
}

export function pitchClassToHue(pitchClass) {
  return PITCH_CLASS_HUES[mod(pitchClass, 12)];
}

function frequencyDistanceInSemitones(left, right) {
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left <= 0 ||
    right <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(12 * Math.log2(left / right));
}

export function collapseFrequencyToNearestFamily(frequency, weight, families) {
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !Array.isArray(families) ||
    !families.length ||
    weight >= WEAK_COMPONENT_FLOOR
  ) {
    return frequency;
  }

  let bestFamily = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const family of families) {
    const distance = frequencyDistanceInSemitones(frequency, family.frequency);
    if (
      distance <= FAMILY_DISTANCE_SEMITONES &&
      distance < bestDistance &&
      family.weight > weight
    ) {
      bestDistance = distance;
      bestFamily = family;
    }
  }

  return bestFamily?.frequency ?? frequency;
}

export function createChromesthesiaColor({
  frequency,
  strength = 0,
  stability = 0,
  spectralCentroid = 0,
}) {
  const pitchClass = getPitchClassForFrequency(frequency);
  const octave = getOctaveForFrequency(frequency);
  if (pitchClass == null || octave == null) {
    return {
      rgb: { r: 0, g: 0, b: 0 },
      hue: 0,
      saturation: 0,
      value: 0,
      weight: 0,
      pitchClass: null,
      octave: null,
      noteName: null,
    };
  }

  const strengthSignal = clamp01(strength);
  const stabilitySignal = clamp01(stability);
  const octaveSignal = clamp01(
    (octave - LOW_OCTAVE) / (HIGH_OCTAVE - LOW_OCTAVE),
  );
  const centroidSignal = clamp01(spectralCentroid);
  const hue = pitchClassToHue(pitchClass);
  const saturation = Math.min(
    MAX_SATURATION,
    MIN_SATURATION +
      strengthSignal * 0.45 +
      stabilitySignal * 0.15 +
      centroidSignal * 0.05,
  );
  const value = MIN_VALUE + (MAX_VALUE - MIN_VALUE) * octaveSignal;
  const weight = clamp01(strengthSignal * 0.58 + stabilitySignal * 0.42);

  return {
    rgb: hsvToRgb(hue, saturation, value),
    hue,
    saturation,
    value,
    weight,
    pitchClass,
    octave,
    noteName: NOTE_NAMES[pitchClass],
  };
}
