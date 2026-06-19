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

function mod(value, base) {
  return ((value % base) + base) % base;
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

export function getOctaveForFrequency(frequency) {
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
