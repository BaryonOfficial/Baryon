export const SPECTRAL_PITCH_REFERENCE_HZ = 440;

function fract(value) {
  return value - Math.floor(value);
}

function readPositiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function foldAudioFrequencyToSpectralPitchPhase(
  frequencyHz,
  { phase = 0 } = {},
) {
  const frequency = readPositiveFinite(frequencyHz);
  if (frequency === 0) {
    return 0;
  }
  return fract(
    Math.log2(frequency / SPECTRAL_PITCH_REFERENCE_HZ) +
      (Number.isFinite(phase) ? phase : 0),
  );
}

export function resolveSpectralResponseFrequency(entry) {
  return (
    readPositiveFinite(entry?.responseFrequencyHz) ||
    readPositiveFinite(entry?.naturalFrequencyHz)
  );
}

export function createSpectralMomentBasis({ frequencyHz = 0, phase = 0 } = {}) {
  const foldedPhase = foldAudioFrequencyToSpectralPitchPhase(frequencyHz, {
    phase,
  });
  const angle = foldedPhase * Math.PI * 2;
  return [
    Math.cos(angle),
    Math.sin(angle),
    Math.cos(angle * 2),
    Math.sin(angle * 2),
  ];
}

export function deriveSpectralSeedDirection(entries) {
  let minimumFrequencyHz = Infinity;
  for (const entry of entries ?? []) {
    const frequencyHz = resolveSpectralResponseFrequency(entry);
    if (frequencyHz > 0 && frequencyHz < minimumFrequencyHz) {
      minimumFrequencyHz = frequencyHz;
    }
  }
  if (!Number.isFinite(minimumFrequencyHz)) {
    return [1, 0];
  }
  const basis = createSpectralMomentBasis({ frequencyHz: minimumFrequencyHz });
  return [basis[0], basis[1]];
}
