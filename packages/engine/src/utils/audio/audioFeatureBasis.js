import { isAudioFeatureBasis } from "../../contracts/audioFeatureProtocol.js";

export function buildAudioFeatureBasis({
  configuration,
  families,
  shells,
  boundaryMode,
  exposureSeconds,
  spectrum,
}) {
  if (!Array.isArray(families) || !Array.isArray(shells))
    throw new TypeError("A basis requires complete family and shell arrays");
  const basis = {
    basisConvention: "rectangular-permutation-v1",
    boundaryMode,
    sampleRate: configuration.sampleRate,
    channelCount: configuration.channelCount,
    exposureSeconds,
    familyCount: families.length,
    shellCount: shells.length,
    familyIndices: Uint16Array.from(
      families.flatMap(({ u, v, w }) => [u, v, w]),
    ),
    familyShells: Uint16Array.from(families, (family) => family.shellIndex),
    sourceOverlaps: Float64Array.from(
      families,
      (family) => family.sourceAmplitudeOverlap,
    ),
    naturalFrequenciesHz: Float64Array.from(
      shells,
      (shell) => shell.naturalFrequencyHz,
    ),
    qualityFactors: Float64Array.from(shells, (shell) => shell.qualityFactor),
    spectrum: {
      representation: spectrum.representation,
      frameSize: spectrum.frameSize,
      hopSize: spectrum.hopSize,
      transitions: spectrum.transitions.slice(),
    },
  };
  // Validate numbers before integer conversion can disguise a bad identity.
  if (
    families.some(
      (f) =>
        ![f.u, f.v, f.w, f.shellIndex].every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= 65535,
        ),
    ) ||
    !isAudioFeatureBasis(basis)
  )
    throw new TypeError("Invalid static audio feature basis");
  return Object.freeze(basis);
}

const ARRAYS = [
  "familyIndices",
  "familyShells",
  "sourceOverlaps",
  "naturalFrequenciesHz",
  "qualityFactors",
];
export function sameAudioFeatureBasis(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    [
      "basisConvention",
      "boundaryMode",
      "sampleRate",
      "channelCount",
      "exposureSeconds",
      "familyCount",
      "shellCount",
    ].every((key) => a[key] === b[key]) &&
    ARRAYS.every(
      (key) =>
        a[key].length === b[key].length &&
        a[key].every((value, i) => value === b[key][i]),
    ) &&
    ["representation", "frameSize", "hopSize"].every(
      (key) => a.spectrum[key] === b.spectrum[key],
    ) &&
    a.spectrum.transitions.every(
      (value, i) => value === b.spectrum.transitions[i],
    )
  );
}
