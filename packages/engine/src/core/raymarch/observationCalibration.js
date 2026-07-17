import { HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED } from "./observationTransfer.js";
import { DISPLAY_RADIANCE_HEADROOM_CONTRACT } from "../../render/displayRadiance.js";

export const HOLOGRAPHIC_BASE_RADIANCE_HALF_STOP_RATIO = Math.SQRT2;

const GRID_TOLERANCE = 1e-10;

function isNonemptyIdentity(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHalfStopGridValue(gain) {
  if (!(Number.isFinite(gain) && gain > 0)) {
    return false;
  }
  const stepIndex =
    (2 * Math.log(gain / HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED)) /
    Math.LN2;
  return Math.abs(stepIndex - Math.round(stepIndex)) <= GRID_TOLERANCE;
}

function isConsecutiveHalfStop(left, right) {
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(right / left - HOLOGRAPHIC_BASE_RADIANCE_HALF_STOP_RATIO) <=
      GRID_TOLERANCE
  );
}

function evaluateHeadroomMetrics(headroom) {
  const luminanceP99 = headroom?.straightRadianceLuminanceP99;
  const maxChannelP99 = headroom?.straightRadianceMaxChannelP99;
  const overloadShare = headroom?.overloadShare;
  const activeSampleCount = headroom?.activeSampleCount;
  const finite =
    Number.isFinite(luminanceP99) &&
    Number.isFinite(maxChannelP99) &&
    Number.isFinite(overloadShare) &&
    Number.isInteger(activeSampleCount) &&
    activeSampleCount > 0;

  return {
    finite,
    achieved:
      finite &&
      luminanceP99 <= DISPLAY_RADIANCE_HEADROOM_CONTRACT.luminanceP99Max &&
      maxChannelP99 <= DISPLAY_RADIANCE_HEADROOM_CONTRACT.maxChannelP99Max &&
      overloadShare <= DISPLAY_RADIANCE_HEADROOM_CONTRACT.overloadShareMax,
  };
}

function evaluatePositiveCandidate(candidate) {
  const headroom = evaluateHeadroomMetrics(candidate?.headroom);
  const finite =
    Number.isFinite(candidate?.gain) &&
    isHalfStopGridValue(candidate.gain) &&
    typeof candidate?.passesPhysicsGates === "boolean" &&
    typeof candidate?.passesAntiBlackGate === "boolean" &&
    typeof candidate?.passesBroadWashGate === "boolean" &&
    typeof candidate?.passesLiveBaseApproval === "boolean" &&
    typeof candidate?.measurementDistinguishable === "boolean" &&
    headroom.finite;
  const highSideFailure =
    finite &&
    (candidate.passesBroadWashGate !== true || headroom.achieved !== true);
  const passes =
    finite &&
    candidate.passesPhysicsGates === true &&
    candidate.passesAntiBlackGate === true &&
    candidate.passesBroadWashGate === true &&
    candidate.passesLiveBaseApproval === true &&
    candidate.measurementDistinguishable === true &&
    headroom.achieved === true;

  return { finite, headroom, highSideFailure, passes };
}

/** Returns the unbounded logarithmic candidate at a signed half-stop index. */
export function deriveHolographicBaseRadianceCalibrationGain(stepIndex) {
  if (!Number.isInteger(stepIndex)) {
    throw new TypeError("Calibration step index must be an integer.");
  }
  return HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED * 2 ** (stepIndex / 2);
}

/**
 * Builds a requested contiguous portion of the adaptive search. The zero
 * canary is always first; callers extend either signed edge as evidence
 * requires, so this helper imposes no gain ceiling.
 */
export function createHolographicBaseRadianceCalibrationSweep({
  minStepIndex = 0,
  maxStepIndex = 0,
} = {}) {
  if (
    !Number.isInteger(minStepIndex) ||
    !Number.isInteger(maxStepIndex) ||
    minStepIndex > maxStepIndex
  ) {
    throw new TypeError("Calibration sweep bounds must be ordered integers.");
  }

  return Object.freeze([
    0,
    ...Array.from({ length: maxStepIndex - minStepIndex + 1 }, (_, offset) =>
      deriveHolographicBaseRadianceCalibrationGain(minStepIndex + offset),
    ),
  ]);
}

/**
 * @param {{
 *   reason?: string,
 *   targetManifestIdentity?: string | null,
 *   evaluatedCandidateCount?: number,
 *   invalidCandidateGains?: number[],
 * }} [options]
 */
function createFailure({
  reason,
  targetManifestIdentity = null,
  evaluatedCandidateCount = 0,
  invalidCandidateGains = [],
} = {}) {
  return Object.freeze({
    achieved: false,
    selectedGain: null,
    targetManifestIdentity,
    evaluatedCandidateCount,
    invalidCandidateGains: Object.freeze([...invalidCandidateGains]),
    reason,
  });
}

/**
 * Selects the lowest complete, evidence-backed scene-radiance gain.
 *
 * The evidence set must contain one rejected zero canary, a contiguous
 * half-stop grid containing the canonical search seed, a lower failing or
 * measurement-indistinguishable bracket, and two consecutive upper failures
 * caused by broad wash or the exact pre-shoulder headroom contract.
 */
export function selectHolographicBaseRadianceCalibration({
  targetManifestIdentity = null,
  candidateMetrics = [],
} = {}) {
  if (!isNonemptyIdentity(targetManifestIdentity)) {
    return createFailure({ reason: "invalid-target-manifest-identity" });
  }
  if (!Array.isArray(candidateMetrics) || candidateMetrics.length < 4) {
    return createFailure({
      reason: "incomplete-evidence",
      targetManifestIdentity,
    });
  }

  const zeroCandidates = candidateMetrics.filter(
    (candidate) => candidate?.gain === 0,
  );
  const zeroCanary = zeroCandidates[0];
  if (
    zeroCandidates.length !== 1 ||
    zeroCanary?.targetManifestIdentity !== targetManifestIdentity ||
    zeroCanary?.passesAntiBlackGate !== false ||
    zeroCanary?.passesLiveBaseApproval !== false
  ) {
    return createFailure({
      reason: "invalid-zero-canary",
      targetManifestIdentity,
    });
  }

  const positiveCandidates = candidateMetrics
    .filter((candidate) => candidate?.gain !== 0)
    .sort((left, right) => left.gain - right.gain);
  const duplicateGains = positiveCandidates.filter(
    (candidate, index) =>
      index > 0 && candidate.gain === positiveCandidates[index - 1].gain,
  );
  const manifestMismatch = positiveCandidates.some(
    (candidate) => candidate?.targetManifestIdentity !== targetManifestIdentity,
  );
  const evaluated = positiveCandidates.map((candidate) => ({
    candidate,
    evaluation: evaluatePositiveCandidate(candidate),
  }));
  const invalidCandidateGains = evaluated
    .filter(({ evaluation }) => !evaluation.finite)
    .map(({ candidate }) => candidate?.gain ?? Number.NaN);
  const containsSeed = positiveCandidates.some(
    (candidate) =>
      Math.abs(candidate.gain - HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED) <=
      GRID_TOLERANCE,
  );
  const contiguousGrid = positiveCandidates.every(
    (candidate, index) =>
      index === 0 ||
      isConsecutiveHalfStop(positiveCandidates[index - 1].gain, candidate.gain),
  );

  if (
    manifestMismatch ||
    duplicateGains.length > 0 ||
    invalidCandidateGains.length > 0 ||
    !containsSeed ||
    !contiguousGrid
  ) {
    return createFailure({
      reason: "invalid-evidence",
      targetManifestIdentity,
      evaluatedCandidateCount: evaluated.length,
      invalidCandidateGains,
    });
  }

  const first = evaluated[0];
  const lowerBracketComplete =
    first.evaluation.passes !== true ||
    first.candidate.measurementDistinguishable === false;
  if (!lowerBracketComplete) {
    return createFailure({
      reason: "incomplete-low-side-bracket",
      targetManifestIdentity,
      evaluatedCandidateCount: evaluated.length,
    });
  }

  const highBracket = evaluated.slice(-2);
  const highSideBracketComplete =
    highBracket.length === 2 &&
    isConsecutiveHalfStop(
      highBracket[0].candidate.gain,
      highBracket[1].candidate.gain,
    ) &&
    highBracket.every(({ evaluation }) => evaluation.highSideFailure);
  if (!highSideBracketComplete) {
    return createFailure({
      reason: "incomplete-high-side-bracket",
      targetManifestIdentity,
      evaluatedCandidateCount: evaluated.length,
    });
  }

  const selected = evaluated.find(({ evaluation }) => evaluation.passes);
  if (!selected) {
    return createFailure({
      reason: "no-passing-candidate",
      targetManifestIdentity,
      evaluatedCandidateCount: evaluated.length,
    });
  }

  return Object.freeze({
    achieved: true,
    selectedGain: selected.candidate.gain,
    targetManifestIdentity,
    evaluatedCandidateCount: evaluated.length,
    invalidCandidateGains: Object.freeze([]),
    reason: "lowest-passing-candidate",
  });
}
