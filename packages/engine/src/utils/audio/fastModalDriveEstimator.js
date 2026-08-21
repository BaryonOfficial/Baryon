import { clamp01 } from "../math.js";
import { computeForcedModalTransferEnergy } from "./modalTransfer.js";
import { requireModalQualityFactor } from "./modalDamping.js";

export const FAST_MODAL_DRIVE_PROBE_LIMIT = 48;
export const FAST_MODAL_DRIVE_WINDOW_SAMPLES = 2048;

const ENERGY_SHARE_DENOMINATOR_FLOOR = 1e-9;
const MAX_UINT16_MODE_COUNT = 0x10000;
const TWO_PI = Math.PI * 2;

/** Below this the sinusoid sum is a multiple of 2π and the series is N ones. */
const SINUSOID_SUM_SINGULARITY = 1e-13;

/**
 * Modes whose frequencies agree to this relative precision are one measurement
 * channel. A cube's mode frequencies come from |n| through a single formula, so
 * exact degeneracies — (0,0,3) and (1,2,2) both at 177.6 Hz — differ only by
 * round-off. No temporal measurement can separate them, so they share a probe.
 */
const DEGENERATE_FREQUENCY_TOLERANCE = 1e-9;

/**
 * Smallest Gram eigenvalue, relative to the largest, that the window is
 * treated as able to resolve.
 *
 * A 42.7 ms window resolves far fewer independent directions than a densely
 * committed topology has probes, so the basis is overcomplete and inverting it
 * outright is ill-posed. The bound that fixes this value is energy: a direction
 * at relative eigenvalue e contributes window energy proportional to e, so
 * inverting it amplifies amplitude by 1/sqrt(e). A mode's drive amplitude
 * cannot exceed the amplitude of the signal driving it, so directions needing
 * more than a small amplification are not measurements of anything — they are
 * extrapolations into the window's null space, and they come back as large
 * amplitudes that cancel against each other.
 *
 * At 0.05 the amplification is bounded near 4.5, and the largest amplitude
 * fitted to a sub-floor 45 Hz tone measures 0.42 against an input of 0.50 —
 * no energy manufactured. Loosening to 1e-6 lets that reach 44.6, and 1e-8
 * reaches 138.8. Attribution accuracy agrees independently: equal-power 60 Hz
 * and 670 Hz tones split 0.503/0.497 here, degrading to 0.797/0.203 at 1e-8.
 *
 * Discarding those directions leaves the minimum-norm fit, which is also the
 * physically honest one: modes the window cannot tell apart share the energy
 * rather than one of them claiming it.
 */
const RESOLVABLE_EIGENVALUE_RATIO = 0.05;
const JACOBI_MAX_SWEEPS = 60;

/**
 * @typedef {{
 *   modeKey: string,
 *   naturalFrequencyHz: number,
 *   targetEnergy?: number,
 *   physicalTransfer: number,
 *   qualityFactor: number,
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

function readModeQualityFactor(mode, index) {
  return requireModalQualityFactor(
    mode?.qualityFactor,
    `Committed mode ${readModeKey(mode, index)}`,
  );
}

/**
 * Whether one committed mode can carry a Goertzel probe at this sample rate.
 *
 * The probe correlates the signal against a discrete basis at angular
 * frequency omega = 2*pi*f/fs. At or above Nyquist that basis aliases onto a
 * lower frequency, so the measurement no longer belongs to the mode it claims
 * to describe; below or at zero there is no oscillation to measure at all.
 * Either way the mode carries no recoverable drive evidence in this frame and
 * is left to its own Q-derived decay instead.
 *
 * @param {FastModalCommittedMode} mode
 * @param {number} sampleRate
 */
export function isFastModalProbeableMode(mode, sampleRate) {
  const frequencyHz = mode?.naturalFrequencyHz;
  return (
    Number.isFinite(sampleRate) &&
    sampleRate > 0 &&
    Number.isFinite(frequencyHz) &&
    frequencyHz > 0 &&
    frequencyHz < sampleRate / 2
  );
}

/**
 * Select the strongest committed modes using structural target energy.
 * Equal-energy modes are ordered by canonical modal identity, then source
 * index, so topology packets are stable across engines and runtimes.
 *
 * Selection is a structural/topology operation and may allocate. The returned
 * indices are consumed by the allocation-stable fast evaluator below.
 *
 * When `sampleRate` is supplied, modes that cannot carry a probe at that rate
 * are excluded from selection rather than rejected later: an unmeasurable mode
 * must cost its frame nothing, not abort it.
 *
 * @param {FastModalCommittedMode[]} committedModes
 * @param {number} [limit]
 * @param {number} [sampleRate]
 */
export function selectFastModalProbeModeIndices(
  committedModes,
  limit = FAST_MODAL_DRIVE_PROBE_LIMIT,
  sampleRate = 0,
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
  const probeRate = Number.isFinite(sampleRate) ? sampleRate : 0;
  const ranked = committedModes
    .map((mode, index) => ({
      index,
      modeKey: readModeKey(mode, index),
      targetEnergy: Number.isFinite(mode?.targetEnergy)
        ? Math.max(0, mode.targetEnergy)
        : 0,
      probeable:
        probeRate > 0 ? isFastModalProbeableMode(mode, probeRate) : true,
    }))
    .filter((entry) => entry.probeable);
  ranked.sort(
    (left, right) =>
      right.targetEnergy - left.targetEnergy ||
      compareModeIdentity(left.modeKey, right.modeKey) ||
      left.index - right.index,
  );

  const selected = new Uint16Array(Math.min(selectionLimit, ranked.length));
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

function wrapToPi(angle) {
  const wrapped = angle % TWO_PI;
  if (wrapped > Math.PI) {
    return wrapped - TWO_PI;
  }
  if (wrapped < -Math.PI) {
    return wrapped + TWO_PI;
  }
  return wrapped;
}

/**
 * Closed-form sums of cos(wn) and sin(wn) over n in [0, sampleCount).
 *
 * Both are the parts of the truncated geometric series
 * `sum e^{iwn} = e^{iw(N-1)/2} · sin(wN/2) / sin(w/2)`, exact for every w that
 * is not a multiple of 2π. There the series is N terms of one, so the limit is
 * taken directly rather than divided by a vanishing denominator.
 */
function sumSinusoid(omega, sampleCount, out) {
  const wrapped = wrapToPi(omega);
  const halfSine = Math.sin(wrapped * 0.5);
  if (Math.abs(halfSine) < SINUSOID_SUM_SINGULARITY) {
    out.cosine = sampleCount;
    out.sine = 0;
    return out;
  }
  const ratio = Math.sin(wrapped * 0.5 * sampleCount) / halfSine;
  const centerPhase = wrapped * 0.5 * (sampleCount - 1);
  out.cosine = Math.cos(centerPhase) * ratio;
  out.sine = Math.sin(centerPhase) * ratio;
  return out;
}

/**
 * Gram matrix of the probe basis `[cos_0, sin_0, cos_1, sin_1, ...]` over the
 * observation window, built from closed forms rather than by accumulating
 * 2048 products per pair.
 *
 * Writing `C(w)` and `S(w)` for the sums above and using the product-to-sum
 * identities:
 *
 *   <cos_i, cos_j> = ½[C(w_i - w_j) + C(w_i + w_j)]
 *   <sin_i, sin_j> = ½[C(w_i - w_j) - C(w_i + w_j)]
 *   <cos_i, sin_j> = ½[S(w_i + w_j) - S(w_i - w_j)]
 *   <sin_i, cos_j> = ½[S(w_i + w_j) + S(w_i - w_j)]
 */
function buildProbeGramMatrix(angularFrequencies, sampleCount) {
  const channelCount = angularFrequencies.length;
  const size = channelCount * 2;
  const gram = new Float64Array(size * size);
  const difference = { cosine: 0, sine: 0 };
  const sum = { cosine: 0, sine: 0 };

  for (let row = 0; row < channelCount; row += 1) {
    for (let column = row; column < channelCount; column += 1) {
      sumSinusoid(
        angularFrequencies[row] - angularFrequencies[column],
        sampleCount,
        difference,
      );
      sumSinusoid(
        angularFrequencies[row] + angularFrequencies[column],
        sampleCount,
        sum,
      );
      const cosineCosine = 0.5 * (difference.cosine + sum.cosine);
      const sineSine = 0.5 * (difference.cosine - sum.cosine);
      const cosineSine = 0.5 * (sum.sine - difference.sine);
      const sineCosine = 0.5 * (sum.sine + difference.sine);
      const rowCosine = row * 2;
      const rowSine = rowCosine + 1;
      const columnCosine = column * 2;
      const columnSine = columnCosine + 1;

      gram[rowCosine * size + columnCosine] = cosineCosine;
      gram[columnCosine * size + rowCosine] = cosineCosine;
      gram[rowSine * size + columnSine] = sineSine;
      gram[columnSine * size + rowSine] = sineSine;
      gram[rowCosine * size + columnSine] = cosineSine;
      gram[columnSine * size + rowCosine] = cosineSine;
      gram[rowSine * size + columnCosine] = sineCosine;
      gram[columnCosine * size + rowSine] = sineCosine;
    }
  }
  return gram;
}

/**
 * Eigendecomposition of a symmetric matrix by cyclic Jacobi rotations.
 *
 * Jacobi is chosen over a faster tridiagonal reduction because it stays
 * accurate on the tiny eigenvalues, and those are exactly the ones whose
 * magnitude decides what the window can resolve.
 *
 * Eigenvector `j` occupies column `j` of `vectors`.
 */
function decomposeSymmetricMatrix(matrix, size) {
  const working = Float64Array.from(matrix);
  const vectors = new Float64Array(size * size);
  for (let index = 0; index < size; index += 1) {
    vectors[index * size + index] = 1;
  }

  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; sweep += 1) {
    let offDiagonal = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        offDiagonal += working[row * size + column] ** 2;
      }
    }
    if (offDiagonal <= Number.EPSILON ** 2) {
      break;
    }

    for (let pivot = 0; pivot < size - 1; pivot += 1) {
      for (let column = pivot + 1; column < size; column += 1) {
        const offEntry = working[pivot * size + column];
        if (offEntry === 0) {
          continue;
        }
        const ratio =
          (working[column * size + column] - working[pivot * size + pivot]) /
          (2 * offEntry);
        const tangentSign = ratio >= 0 ? 1 : -1;
        const tangent =
          tangentSign / (Math.abs(ratio) + Math.sqrt(ratio * ratio + 1));
        const cosine = 1 / Math.sqrt(tangent * tangent + 1);
        const sine = tangent * cosine;

        for (let index = 0; index < size; index += 1) {
          const atPivot = working[index * size + pivot];
          const atColumn = working[index * size + column];
          working[index * size + pivot] = cosine * atPivot - sine * atColumn;
          working[index * size + column] = sine * atPivot + cosine * atColumn;
        }
        for (let index = 0; index < size; index += 1) {
          const atPivot = working[pivot * size + index];
          const atColumn = working[column * size + index];
          working[pivot * size + index] = cosine * atPivot - sine * atColumn;
          working[column * size + index] = sine * atPivot + cosine * atColumn;
        }
        for (let index = 0; index < size; index += 1) {
          const atPivot = vectors[index * size + pivot];
          const atColumn = vectors[index * size + column];
          vectors[index * size + pivot] = cosine * atPivot - sine * atColumn;
          vectors[index * size + column] = sine * atPivot + cosine * atColumn;
        }
      }
    }
  }

  const values = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    values[index] = working[index * size + index];
  }
  return { values, vectors };
}

/**
 * Pseudo-inverse of the probe Gram, with unresolvable directions dropped.
 *
 * Applying this to the projections yields the minimum-norm least-squares fit:
 * the amplitudes that explain the window using only directions it can actually
 * distinguish, instead of the exact-but-meaningless fit that reaches the same
 * residual through amplitudes hundreds of times the input.
 */
function buildResolvableGramPseudoInverse(gram, size) {
  const { values, vectors } = decomposeSymmetricMatrix(gram, size);
  let largest = 0;
  for (let index = 0; index < size; index += 1) {
    largest = Math.max(largest, values[index]);
  }
  const threshold = largest * RESOLVABLE_EIGENVALUE_RATIO;

  const pseudoInverse = new Float64Array(size * size);
  let resolvedRank = 0;
  for (let mode = 0; mode < size; mode += 1) {
    if (!(values[mode] > threshold)) {
      continue;
    }
    resolvedRank += 1;
    const inverseValue = 1 / values[mode];
    for (let row = 0; row < size; row += 1) {
      const rowComponent = vectors[row * size + mode] * inverseValue;
      if (rowComponent === 0) {
        continue;
      }
      for (let column = 0; column < size; column += 1) {
        pseudoInverse[row * size + column] +=
          rowComponent * vectors[column * size + mode];
      }
    }
  }
  return { pseudoInverse, resolvedRank };
}

/**
 * Modal transfer of the driven cavity, `G_n(w) = 1 / (wn^2 - w^2 + i w wn / Q)`,
 * tabulated once for every (committed mode, probe channel) pair.
 *
 * This is the forced response of modal superposition, not the resonant
 * absorption the drive used to be weighted by. The difference is what a mode
 * does when the drive is NOT on top of it: absorption falls to nothing, so a
 * cavity whose modes are far apart answers almost no frequency at all, while
 * the forced term only falls off as 1/(wn^2 - w^2) and keeps a real, signed
 * contribution. It also changes sign across resonance — in phase below, out of
 * phase above — which is what makes neighbouring modes interfere correctly.
 *
 * Two consequences worth stating, because they used to need their own
 * machinery. Below the lowest mode the response tends to the stiffness-
 * controlled 1/wn^2 rather than zero, so drive under the cavity's acoustic
 * floor genuinely forces the fundamental. And away from resonance the result
 * barely depends on Q at all, so Q is free to mean what it physically means —
 * the height and width of the peak — instead of deciding whether the
 * instrument responds.
 *
 * Stored as absolute energy response in mode-major order so the per-frame
 * accumulation walks each mode's row contiguously.
 */
function buildForcedModalTransfer(
  committedModes,
  channelFrequenciesHz,
  weights,
) {
  const modeCount = committedModes.length;
  const channelCount = channelFrequenciesHz.length;
  weights.fill(0);
  for (let modeIndex = 0; modeIndex < modeCount; modeIndex += 1) {
    const mode = committedModes[modeIndex];
    const modeHz = readFiniteFrequency(mode?.naturalFrequencyHz);
    const qualityFactor = readModeQualityFactor(mode, modeIndex);
    const rowOffset = modeIndex * channelCount;
    for (let channel = 0; channel < channelCount; channel += 1) {
      weights[rowOffset + channel] = computeForcedModalTransferEnergy({
        driveHz: channelFrequenciesHz[channel],
        modeHz,
        qualityFactor,
      });
    }
  }
  return weights;
}

function readFiniteFrequency(value) {
  return Number.isFinite(value) ? value : 0;
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
  // Each probe's measurement channel, and how many probes share it. Exactly
  // degenerate modes are one channel: they present the same basis to the
  // window, so fitting them separately would let each claim the same energy.
  const probeChannels = new Int32Array(probeCount);
  const channelMemberCounts = new Int32Array(probeCount);

  const real = new Float32Array(probeCount);
  const imaginary = new Float32Array(probeCount);
  const magnitudes = new Float32Array(probeCount);
  const phasesRad = new Float32Array(probeCount);
  const responseEnergies = new Float32Array(probeCount);
  const responseEnergyByMode = new Float32Array(committedModes.length);
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

    stableProbeModeIndices[probeIndex] = modeIndex;
    frequenciesHz[probeIndex] = frequencyHz;
    physicalTransfers[probeIndex] = clamp01(mode.physicalTransfer);
    modeKeys[probeIndex] = modeKey;
    measurements[probeIndex] = {
      modeKey,
      frequencyHz,
      driveWeight: 0,
      magnitude: 0,
      phaseRad: 0,
    };
  }

  // Assign channels by ascending frequency so degenerate modes land together
  // regardless of the order they were selected in.
  const channelFrequencyList = [];
  const probeOrder = Array.from({ length: probeCount }, (_, index) => index);
  probeOrder.sort((left, right) => frequenciesHz[left] - frequenciesHz[right]);
  for (const probeIndex of probeOrder) {
    const frequencyHz = frequenciesHz[probeIndex];
    const lastChannel = channelFrequencyList.length - 1;
    const isDegenerate =
      lastChannel >= 0 &&
      Math.abs(frequencyHz - channelFrequencyList[lastChannel]) <=
        DEGENERATE_FREQUENCY_TOLERANCE * frequencyHz;
    if (!isDegenerate) {
      channelFrequencyList.push(frequencyHz);
    }
    const channel = channelFrequencyList.length - 1;
    probeChannels[probeIndex] = channel;
    channelMemberCounts[channel] += 1;
  }

  const channelCount = channelFrequencyList.length;
  const channelFrequenciesHz = Float64Array.from(channelFrequencyList);
  const angularFrequencies = new Float64Array(channelCount);
  const recurrenceCoefficients = new Float64Array(channelCount);
  const cosines = new Float64Array(channelCount);
  const sines = new Float64Array(channelCount);
  const phaseReferenceCosines = new Float64Array(channelCount);
  const phaseReferenceSines = new Float64Array(channelCount);
  const recurrenceS1 = new Float64Array(channelCount);
  const recurrenceS2 = new Float64Array(channelCount);
  const channelExplainedEnergy = new Float64Array(channelCount);
  const channelMagnitudes = new Float64Array(channelCount);
  const channelPhasesRad = new Float64Array(channelCount);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const omega = (TWO_PI * channelFrequenciesHz[channel]) / sampleRate;
    // A Goertzel terminal state is referenced to the window's final sample.
    // Rotate by −(N−1)ω so phase is measured at the shared window origin even
    // when the probe is not centered on a DFT bin.
    const referencePhase = -(FAST_MODAL_DRIVE_WINDOW_SAMPLES - 1) * omega;
    angularFrequencies[channel] = omega;
    cosines[channel] = Math.cos(omega);
    sines[channel] = Math.sin(omega);
    recurrenceCoefficients[channel] = 2 * Math.cos(omega);
    phaseReferenceCosines[channel] = Math.cos(referencePhase);
    phaseReferenceSines[channel] = Math.sin(referencePhase);
  }

  // The basis is fixed by the committed frequencies and the window length, so
  // the Gram and its truncated inverse are built once here, not per frame.
  const solveSize = channelCount * 2;
  const probeGram = buildProbeGramMatrix(
    angularFrequencies,
    FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  );
  const { pseudoInverse: gramPseudoInverse, resolvedRank } =
    buildResolvableGramPseudoInverse(probeGram, solveSize);
  const solveVector = new Float64Array(solveSize);
  const projections = new Float64Array(solveSize);

  // Every committed mode is forced by the drive, not just the probed ones:
  // the transfer is a fixed matrix-vector product, so responding modes are no
  // longer limited to what the probe budget can measure directly.
  const forcedTransfer = new Float64Array(committedModes.length * channelCount);
  buildForcedModalTransfer(
    committedModes,
    channelFrequenciesHz,
    forcedTransfer,
  );
  const forcedEnergies = new Float64Array(committedModes.length);
  const channelDriveShares = new Float64Array(channelCount);
  const modePhysicalTransfers = new Float32Array(committedModes.length);
  const modeQualityFactors = new Float64Array(committedModes.length);
  for (let modeIndex = 0; modeIndex < committedModes.length; modeIndex += 1) {
    modePhysicalTransfers[modeIndex] = clamp01(
      committedModes[modeIndex]?.physicalTransfer,
    );
    modeQualityFactors[modeIndex] = readModeQualityFactor(
      committedModes[modeIndex],
      modeIndex,
    );
  }

  const result = {
    modeCount: committedModes.length,
    probeCount,
    sampleRate,
    windowSamples: FAST_MODAL_DRIVE_WINDOW_SAMPLES,
    rms: 0,
    inputEnergyScale: 0,
    hardSilence: false,
    probeModeIndices: stableProbeModeIndices,
    modeKeys,
    frequenciesHz,
    real,
    imaginary,
    magnitudes,
    phasesRad,
    responseEnergies,
    responseEnergyByMode,
    targetEnergies,
    targetEnergyByMode,
    measurements,
    channelCount,
    channelFrequenciesHz,
    // Independent directions the window resolves, out of `channelCount * 2`
    // committed. A rank well below the basis size means the topology has
    // committed more modes than this window length can separate.
    resolvedRank,
    // Share of window energy the fitted SOURCE basis accounts for. The modal
    // response energies below are absolute per-mode transfers and need not
    // partition this value.
    explainedEnergyShare: 0,
  };

  function clearOutput(hardSilence) {
    real.fill(0);
    imaginary.fill(0);
    magnitudes.fill(0);
    phasesRad.fill(0);
    responseEnergies.fill(0);
    responseEnergyByMode.fill(0);
    targetEnergies.fill(0);
    targetEnergyByMode.fill(0);
    for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
      const measurement = measurements[probeIndex];
      measurement.driveWeight = 0;
      measurement.magnitude = 0;
      measurement.phaseRad = 0;
    }
    result.rms = 0;
    result.inputEnergyScale = 0;
    result.explainedEnergyShare = 0;
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
    // Every committed mode is forced now, not only the probed ones, so all of
    // their transfers refresh here. A quality factor feeds the modal transfer
    // rather than scaling a result, so when one moves the transfer is rebuilt
    // in place — it is derived from the committed frequencies, which this path
    // has already checked are unchanged, so it stays a live coefficient update
    // rather than a topology change.
    let qualityChanged = false;
    for (let modeIndex = 0; modeIndex < committedModes.length; modeIndex += 1) {
      const mode = nextCommittedModes[modeIndex];
      const quality = readModeQualityFactor(mode, modeIndex);
      if (quality !== modeQualityFactors[modeIndex]) {
        modeQualityFactors[modeIndex] = quality;
        qualityChanged = true;
      }
      modePhysicalTransfers[modeIndex] = clamp01(mode?.physicalTransfer);
    }
    if (qualityChanged) {
      buildForcedModalTransfer(
        nextCommittedModes,
        channelFrequenciesHz,
        forcedTransfer,
      );
    }
  }

  /** Run every channel's recurrence over the window tail; returns its energy. */
  function accumulateWindow(timeDomainData) {
    recurrenceS1.fill(0);
    recurrenceS2.fill(0);
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
      for (let channel = 0; channel < channelCount; channel += 1) {
        const s0 =
          sample +
          recurrenceCoefficients[channel] * recurrenceS1[channel] -
          recurrenceS2[channel];
        recurrenceS2[channel] = recurrenceS1[channel];
        recurrenceS1[channel] = s0;
      }
    }
    return sumSquares;
  }

  /**
   * Turn the terminal recurrence states into one least-squares fit over the
   * whole basis, and read each channel's amplitude, phase, and energy from it.
   *
   * Returns the energy the fit explains and the scale that keeps the per-channel
   * energies a non-negative partition of it.
   */
  function fitChannels() {
    // Project the window onto each channel's cosine and sine at the shared
    // window origin. These are the right-hand side of the normal equations,
    // not yet amplitudes: a probe correlating with the signal says nothing
    // about how much of it belongs to that probe until the overlap between
    // probes is divided out.
    for (let channel = 0; channel < channelCount; channel += 1) {
      const terminalRe =
        recurrenceS1[channel] - recurrenceS2[channel] * cosines[channel];
      const terminalIm = recurrenceS2[channel] * sines[channel];
      projections[channel * 2] =
        terminalRe * phaseReferenceCosines[channel] -
        terminalIm * phaseReferenceSines[channel];
      projections[channel * 2 + 1] = -(
        terminalRe * phaseReferenceSines[channel] +
        terminalIm * phaseReferenceCosines[channel]
      );
    }

    // Solving per probe instead would let overlapping probes each claim the
    // same acoustic energy, inflating the summed share wherever the mode
    // lattice is dense and starving the sparse low-frequency end once a shared
    // budget renormalizes the result.
    for (let row = 0; row < solveSize; row += 1) {
      let total = 0;
      for (let column = 0; column < solveSize; column += 1) {
        total +=
          gramPseudoInverse[row * solveSize + column] * projections[column];
      }
      solveVector[row] = total;
    }

    // With `G θ = d` satisfied, `θ·d` is the energy the fit explains and
    // `θ_k·d_k` is channel k's exact term in it, cross-correlations included.
    // Summing the parts therefore reproduces the whole, which is what makes
    // these shares a partition instead of an over-count.
    //
    // Weighing each channel by its own fitted amplitude instead was measured
    // and is worse: the minimum-norm fit spreads amplitude across overlapping
    // channels, and only these cross terms cancel that spread back out. A pure
    // 670 Hz tone came back 55% attributed to bass modes without them.
    let explainedEnergy = 0;
    let claimedEnergy = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const cosineIndex = channel * 2;
      const sineIndex = cosineIndex + 1;
      const cosineAmplitude = solveVector[cosineIndex];
      const sineAmplitude = solveVector[sineIndex];
      const explained =
        cosineAmplitude * projections[cosineIndex] +
        sineAmplitude * projections[sineIndex];
      channelExplainedEnergy[channel] = explained;
      channelMagnitudes[channel] = Math.hypot(cosineAmplitude, sineAmplitude);
      channelPhasesRad[channel] =
        channelMagnitudes[channel] > 0
          ? Math.atan2(-sineAmplitude, cosineAmplitude)
          : 0;
      explainedEnergy += explained;
      claimedEnergy += Math.max(0, explained);
    }

    // Channels that partly cancel one another leave a few terms slightly
    // negative. Dropping those alone would let the survivors overstate what was
    // measured, so they are scaled back to the energy the fit explains, keeping
    // the shares non-negative and still summing to exactly that. With the
    // resolvable-eigenvalue cut doing the real work this is a small correction
    // — measured between 0.02% and 1.5%, largest for sub-floor input — so it is
    // a guard on the partition, not the thing that establishes it.
    return {
      explainedEnergy,
      claimScale:
        claimedEnergy > 0 ? Math.min(1, explainedEnergy / claimedEnergy) : 0,
    };
  }

  /**
   * Drive the whole committed set through the modal transfer.
   *
   * The fitted source energy at each probe channel is carried onto every mode
   * by that mode's absolute resonant-normalized transfer energy.
   *
   * These are not column-normalized shares: modal density and degeneracy are
   * properties of the apparatus. Identical transfer rows therefore receive
   * identical responses; the exact-shell owner collapses degenerate family
   * rows to one oscillator by maximum, not sum, downstream.
   */
  function applyForcedModalResponse({
    claimScale,
    energyDenominator,
    clampedInputEnergyScale,
  }) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      channelDriveShares[channel] =
        (Math.max(0, channelExplainedEnergy[channel]) * claimScale) /
        energyDenominator;
    }

    for (let modeIndex = 0; modeIndex < forcedEnergies.length; modeIndex += 1) {
      const rowOffset = modeIndex * channelCount;
      let forced = 0;
      for (let channel = 0; channel < channelCount; channel += 1) {
        forced +=
          channelDriveShares[channel] * forcedTransfer[rowOffset + channel];
      }
      forcedEnergies[modeIndex] = forced;
      const responseEnergy = clamp01(forced);
      responseEnergyByMode[modeIndex] = responseEnergy;
      targetEnergyByMode[modeIndex] = clamp01(
        responseEnergy *
          clampedInputEnergyScale *
          modePhysicalTransfers[modeIndex],
      );
    }
  }

  function publishProbeResults({ claimScale, energyDenominator }) {
    for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
      const channel = probeChannels[probeIndex];
      const magnitude = channelMagnitudes[channel];
      const phaseRad = channelPhasesRad[channel];
      const modeIndex = stableProbeModeIndices[probeIndex];
      // The measurement lanes describe the SOURCE at this channel, which is
      // what harmonic lock detection reads. The mode's own forcing is the
      // transferred quantity published above, so the two are not the same
      // number and must not be conflated.
      const driveWeight = clamp01(
        (Math.max(0, channelExplainedEnergy[channel]) * claimScale) /
          energyDenominator /
          channelMemberCounts[channel],
      );

      real[probeIndex] = solveVector[channel * 2];
      imaginary[probeIndex] = -solveVector[channel * 2 + 1];
      magnitudes[probeIndex] = magnitude;
      phasesRad[probeIndex] = phaseRad;
      responseEnergies[probeIndex] = responseEnergyByMode[modeIndex];
      targetEnergies[probeIndex] = targetEnergyByMode[modeIndex];

      const measurement = measurements[probeIndex];
      measurement.driveWeight = driveWeight;
      measurement.magnitude = magnitude;
      measurement.phaseRad = phaseRad;
    }
  }

  /**
   * Evaluate the newest 2048-sample window tail.
   *
   * @param {Float32Array | null} timeDomainData
   * @param {number} [inputEnergyScale]
   * @param {boolean} [hardSilence]
   */
  function evaluate(timeDomainData, inputEnergyScale = 1, hardSilence = false) {
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

    const sumSquares = accumulateWindow(timeDomainData);
    const energyDenominator = Math.max(
      sumSquares,
      ENERGY_SHARE_DENOMINATOR_FLOOR,
    );
    const clampedInputEnergyScale = clamp01(inputEnergyScale);
    const { explainedEnergy, claimScale } = fitChannels();
    const explainedShare = clamp01(explainedEnergy / energyDenominator);

    applyForcedModalResponse({
      claimScale,
      energyDenominator,
      clampedInputEnergyScale,
    });
    publishProbeResults({ claimScale, energyDenominator });

    result.rms = Math.sqrt(sumSquares / FAST_MODAL_DRIVE_WINDOW_SAMPLES);
    result.inputEnergyScale = clampedInputEnergyScale;
    result.explainedEnergyShare = explainedShare;
    result.hardSilence = false;
    return result;
  }

  return Object.freeze({
    result,
    evaluate,
    updateCommittedModes,
  });
}
