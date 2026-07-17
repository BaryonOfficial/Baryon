import { clamp01 } from "../math.js";

export const FAST_MODAL_DRIVE_PROBE_LIMIT = 48;
export const FAST_MODAL_DRIVE_WINDOW_SAMPLES = 2048;

const ENERGY_SHARE_DENOMINATOR_FLOOR = 1e-9;
const GOERTZEL_GRAM_DETERMINANT_FLOOR = 1e-12;
const MAX_UINT16_MODE_COUNT = 0x10000;
const TWO_PI = Math.PI * 2;

/**
 * @typedef {{
 *   modeKey: string,
 *   naturalFrequencyHz: number,
 *   targetEnergy?: number,
 *   physicalTransfer: number,
 * }} FastModalCommittedMode
 */

function compareModeIdentity(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function readModeKey(mode, index) {
  if (typeof mode?.modeKey !== "string" || mode.modeKey.length === 0) {
    throw new TypeError(
      `Committed mode at index ${index} requires a non-empty modeKey.`,
    );
  }
  return mode.modeKey;
}

/**
 * Select the strongest committed modes using structural target energy.
 * Equal-energy modes are ordered by canonical modal identity, then source
 * index, so topology packets are stable across engines and runtimes.
 *
 * Selection is a structural/topology operation and may allocate. The returned
 * indices are consumed by the allocation-stable fast evaluator below.
 *
 * @param {FastModalCommittedMode[]} committedModes
 * @param {number} [limit]
 */
export function selectFastModalProbeModeIndices(
  committedModes,
  limit = FAST_MODAL_DRIVE_PROBE_LIMIT,
) {
  if (!Array.isArray(committedModes)) {
    throw new TypeError("committedModes must be an array.");
  }
  if (committedModes.length > MAX_UINT16_MODE_COUNT) {
    throw new RangeError(
      `committedModes cannot exceed ${MAX_UINT16_MODE_COUNT} entries.`,
    );
  }
  const selectionLimit = Math.min(
    FAST_MODAL_DRIVE_PROBE_LIMIT,
    Math.max(0, Math.trunc(Number.isFinite(limit) ? limit : 0)),
  );
  const ranked = committedModes.map((mode, index) => ({
    index,
    modeKey: readModeKey(mode, index),
    targetEnergy: Number.isFinite(mode?.targetEnergy)
      ? Math.max(0, mode.targetEnergy)
      : 0,
  }));
  ranked.sort(
    (left, right) =>
      right.targetEnergy - left.targetEnergy ||
      compareModeIdentity(left.modeKey, right.modeKey) ||
      left.index - right.index,
  );

  const selected = new Uint16Array(
    Math.min(selectionLimit, committedModes.length),
  );
  for (let index = 0; index < selected.length; index += 1) {
    selected[index] = ranked[index].index;
  }
  return selected;
}

function validateProbeModeIndices(probeModeIndices, modeCount) {
  if (!(probeModeIndices instanceof Uint16Array)) {
    throw new TypeError("probeModeIndices must be a Uint16Array.");
  }
  if (probeModeIndices.length > FAST_MODAL_DRIVE_PROBE_LIMIT) {
    throw new RangeError(
      `probeModeIndices cannot exceed ${FAST_MODAL_DRIVE_PROBE_LIMIT} modes.`,
    );
  }
  const seen = new Set();
  for (let index = 0; index < probeModeIndices.length; index += 1) {
    const modeIndex = probeModeIndices[index];
    if (modeIndex < 0 || modeIndex >= modeCount) {
      throw new RangeError(`Probe mode index ${modeIndex} is out of range.`);
    }
    if (seen.has(modeIndex)) {
      throw new RangeError(`Probe mode index ${modeIndex} is duplicated.`);
    }
    seen.add(modeIndex);
  }
}

/**
 * Create an exact-frequency, batched Goertzel estimator for one committed
 * topology. Recreate it only when topology or sample rate changes.
 *
 * The evaluator owns all typed scratch and output arrays. Once this factory
 * returns, `evaluate` performs no typed-array construction and returns the
 * same result object and buffer identities on every call.
 *
 * `targetEnergyByMode` is intentionally full-width and zero for unselected
 * modes. The modal-response owner can therefore apply selected targets while
 * continuing normal Q-derived physical decay for every unselected mode.
 * `measurements` is a stable object array accepted directly by
 * `resolveHarmonicDrivePhaseLocks` in `modalDrivePhase.js`.
 *
 * @param {{
 *   committedModes: FastModalCommittedMode[],
 *   sampleRate: number,
 *   probeModeIndices?: Uint16Array,
 * }} options
 */
export function createFastModalDriveEstimator({
  committedModes,
  sampleRate,
  probeModeIndices = selectFastModalProbeModeIndices(committedModes),
}) {
  if (!Array.isArray(committedModes)) {
    throw new TypeError("committedModes must be an array.");
  }
  if (committedModes.length > MAX_UINT16_MODE_COUNT) {
    throw new RangeError(
      `committedModes cannot exceed ${MAX_UINT16_MODE_COUNT} entries.`,
    );
  }
  if (!(sampleRate > 0)) {
    throw new RangeError("sampleRate must be positive.");
  }
  validateProbeModeIndices(probeModeIndices, committedModes.length);

  const probeCount = probeModeIndices.length;
  const stableProbeModeIndices = new Uint16Array(probeCount);
  const frequenciesHz = new Float64Array(probeCount);
  const physicalTransfers = new Float32Array(probeCount);
  const recurrenceCoefficients = new Float64Array(probeCount);
  const cosines = new Float64Array(probeCount);
  const sines = new Float64Array(probeCount);
  const phaseReferenceCosines = new Float64Array(probeCount);
  const phaseReferenceSines = new Float64Array(probeCount);
  const gramCosCos = new Float64Array(probeCount);
  const gramSinSin = new Float64Array(probeCount);
  const gramCosSin = new Float64Array(probeCount);
  const gramInverseDeterminants = new Float64Array(probeCount);
  const recurrenceS1 = new Float64Array(probeCount);
  const recurrenceS2 = new Float64Array(probeCount);

  const real = new Float32Array(probeCount);
  const imaginary = new Float32Array(probeCount);
  const magnitudes = new Float32Array(probeCount);
  const phasesRad = new Float32Array(probeCount);
  const energyShares = new Float32Array(probeCount);
  const energyShareByMode = new Float32Array(committedModes.length);
  const targetEnergies = new Float32Array(probeCount);
  const targetEnergyByMode = new Float32Array(committedModes.length);
  const modeKeys = new Array(probeCount);
  const measurements = new Array(probeCount);
  const seenModeKeys = new Set();

  for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
    const modeIndex = probeModeIndices[probeIndex];
    const mode = committedModes[modeIndex];
    const modeKey = readModeKey(mode, modeIndex);
    if (seenModeKeys.has(modeKey)) {
      throw new RangeError(`Selected modeKey ${modeKey} is duplicated.`);
    }
    seenModeKeys.add(modeKey);

    const frequencyHz = mode.naturalFrequencyHz;
    if (!(frequencyHz > 0) || frequencyHz >= sampleRate / 2) {
      throw new RangeError(
        `Selected mode ${modeKey} has an invalid naturalFrequencyHz.`,
      );
    }

    const omega = (TWO_PI * frequencyHz) / sampleRate;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    // A Goertzel terminal state is referenced to the window's final sample.
    // Rotate by −(N−1)ω so phase is measured at the shared window origin even
    // when the probe is not centered on a DFT bin.
    const referencePhase = -(FAST_MODAL_DRIVE_WINDOW_SAMPLES - 1) * omega;
    let cosCos = 0;
    let sinSin = 0;
    let cosSin = 0;
    for (
      let sampleIndex = 0;
      sampleIndex < FAST_MODAL_DRIVE_WINDOW_SAMPLES;
      sampleIndex += 1
    ) {
      const phase = omega * sampleIndex;
      const basisCosine = Math.cos(phase);
      const basisSine = Math.sin(phase);
      cosCos += basisCosine * basisCosine;
      sinSin += basisSine * basisSine;
      cosSin += basisCosine * basisSine;
    }
    const gramDeterminant = cosCos * sinSin - cosSin * cosSin;

    stableProbeModeIndices[probeIndex] = modeIndex;
    frequenciesHz[probeIndex] = frequencyHz;
    physicalTransfers[probeIndex] = clamp01(mode.physicalTransfer);
    recurrenceCoefficients[probeIndex] = 2 * cosine;
    cosines[probeIndex] = cosine;
    sines[probeIndex] = sine;
    phaseReferenceCosines[probeIndex] = Math.cos(referencePhase);
    phaseReferenceSines[probeIndex] = Math.sin(referencePhase);
    gramCosCos[probeIndex] = cosCos;
    gramSinSin[probeIndex] = sinSin;
    gramCosSin[probeIndex] = cosSin;
    gramInverseDeterminants[probeIndex] =
      gramDeterminant > GOERTZEL_GRAM_DETERMINANT_FLOOR
        ? 1 / gramDeterminant
        : 0;
    modeKeys[probeIndex] = modeKey;
    measurements[probeIndex] = {
      modeKey,
      frequencyHz,
      driveWeight: 0,
      magnitude: 0,
      phaseRad: 0,
    };
  }

  const result = {
    modeCount: committedModes.length,
    probeCount,
    sampleRate,
    windowSamples: FAST_MODAL_DRIVE_WINDOW_SAMPLES,
    rms: 0,
    inputExposure: 0,
    hardSilence: false,
    probeModeIndices: stableProbeModeIndices,
    modeKeys,
    frequenciesHz,
    real,
    imaginary,
    magnitudes,
    phasesRad,
    energyShares,
    energyShareByMode,
    targetEnergies,
    targetEnergyByMode,
    measurements,
  };

  function clearOutput(hardSilence) {
    real.fill(0);
    imaginary.fill(0);
    magnitudes.fill(0);
    phasesRad.fill(0);
    energyShares.fill(0);
    energyShareByMode.fill(0);
    targetEnergies.fill(0);
    targetEnergyByMode.fill(0);
    for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
      const measurement = measurements[probeIndex];
      measurement.driveWeight = 0;
      measurement.magnitude = 0;
      measurement.phaseRad = 0;
    }
    result.rms = 0;
    result.inputExposure = 0;
    result.hardSilence = hardSilence;
    return result;
  }

  /**
   * Refresh live transfer coefficients without rebuilding the exact-frequency
   * recurrence basis. Callers must provide the same committed identity and
   * frequency ordering used at construction.
   *
   * @param {FastModalCommittedMode[]} nextCommittedModes
   */
  function updateCommittedModes(nextCommittedModes) {
    if (
      !Array.isArray(nextCommittedModes) ||
      nextCommittedModes.length !== committedModes.length
    ) {
      throw new RangeError("Committed mode topology changed.");
    }
    for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
      const modeIndex = stableProbeModeIndices[probeIndex];
      const mode = nextCommittedModes[modeIndex];
      if (
        readModeKey(mode, modeIndex) !== modeKeys[probeIndex] ||
        mode.naturalFrequencyHz !== frequenciesHz[probeIndex]
      ) {
        throw new RangeError("Committed mode topology changed.");
      }
      physicalTransfers[probeIndex] = clamp01(mode.physicalTransfer);
    }
  }

  /**
   * Evaluate the newest 2048-sample window tail.
   *
   * @param {Float32Array | null} timeDomainData
   * @param {number} [inputExposure]
   * @param {boolean} [hardSilence]
   */
  function evaluate(timeDomainData, inputExposure = 1, hardSilence = false) {
    if (hardSilence === true) {
      return clearOutput(true);
    }
    if (!(timeDomainData instanceof Float32Array)) {
      throw new TypeError("timeDomainData must be a Float32Array.");
    }
    if (timeDomainData.length < FAST_MODAL_DRIVE_WINDOW_SAMPLES) {
      throw new RangeError(
        `timeDomainData requires at least ${FAST_MODAL_DRIVE_WINDOW_SAMPLES} samples.`,
      );
    }

    recurrenceS1.fill(0);
    recurrenceS2.fill(0);
    energyShareByMode.fill(0);
    targetEnergyByMode.fill(0);
    const start = timeDomainData.length - FAST_MODAL_DRIVE_WINDOW_SAMPLES;
    let sumSquares = 0;
    for (
      let sampleOffset = 0;
      sampleOffset < FAST_MODAL_DRIVE_WINDOW_SAMPLES;
      sampleOffset += 1
    ) {
      const rawSample = timeDomainData[start + sampleOffset];
      const sample = Number.isFinite(rawSample) ? rawSample : 0;
      sumSquares += sample * sample;
      for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
        const s0 =
          sample +
          recurrenceCoefficients[probeIndex] * recurrenceS1[probeIndex] -
          recurrenceS2[probeIndex];
        recurrenceS2[probeIndex] = recurrenceS1[probeIndex];
        recurrenceS1[probeIndex] = s0;
      }
    }

    const rms = Math.sqrt(sumSquares / FAST_MODAL_DRIVE_WINDOW_SAMPLES);
    const energyDenominator = Math.max(
      2 * rms * rms,
      ENERGY_SHARE_DENOMINATOR_FLOOR,
    );
    const clampedInputExposure = clamp01(inputExposure);

    for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
      const terminalRe =
        recurrenceS1[probeIndex] -
        recurrenceS2[probeIndex] * cosines[probeIndex];
      const terminalIm = recurrenceS2[probeIndex] * sines[probeIndex];
      const projectionRe =
        terminalRe * phaseReferenceCosines[probeIndex] -
        terminalIm * phaseReferenceSines[probeIndex];
      const projectionIm =
        terminalRe * phaseReferenceSines[probeIndex] +
        terminalIm * phaseReferenceCosines[probeIndex];
      const dotCosine = projectionRe;
      const dotSine = -projectionIm;
      const inverseGramDeterminant = gramInverseDeterminants[probeIndex];

      let measuredRe;
      let measuredIm;
      if (inverseGramDeterminant > 0) {
        // Over a partial cycle, sine and cosine are not orthogonal. The
        // precomputed two-basis Gram inverse removes that sub-bin amplitude
        // and phase bias without changing the 2048-sample observation window.
        measuredRe =
          (dotCosine * gramSinSin[probeIndex] -
            dotSine * gramCosSin[probeIndex]) *
          inverseGramDeterminant;
        measuredIm =
          (dotCosine * gramCosSin[probeIndex] -
            dotSine * gramCosCos[probeIndex]) *
          inverseGramDeterminant;
      } else {
        const normalization = 2 / FAST_MODAL_DRIVE_WINDOW_SAMPLES;
        measuredRe = projectionRe * normalization;
        measuredIm = projectionIm * normalization;
      }

      const magnitude = Math.hypot(measuredRe, measuredIm);
      const phaseRad = magnitude > 0 ? Math.atan2(measuredIm, measuredRe) : 0;
      const energyShare = clamp01((magnitude * magnitude) / energyDenominator);
      const targetEnergy = clamp01(
        energyShare * clampedInputExposure * physicalTransfers[probeIndex],
      );
      const modeIndex = stableProbeModeIndices[probeIndex];

      real[probeIndex] = measuredRe;
      imaginary[probeIndex] = measuredIm;
      magnitudes[probeIndex] = magnitude;
      phasesRad[probeIndex] = phaseRad;
      energyShares[probeIndex] = energyShare;
      energyShareByMode[modeIndex] = energyShare;
      targetEnergies[probeIndex] = targetEnergy;
      targetEnergyByMode[modeIndex] = targetEnergy;

      const measurement = measurements[probeIndex];
      measurement.driveWeight = energyShare;
      measurement.magnitude = magnitude;
      measurement.phaseRad = phaseRad;
    }

    result.rms = rms;
    result.inputExposure = clampedInputExposure;
    result.hardSilence = false;
    return result;
  }

  return Object.freeze({
    result,
    evaluate,
    updateCommittedModes,
  });
}
