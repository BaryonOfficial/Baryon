import { describe, expect, it } from "vitest";
import { HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED } from "./observationTransfer.js";
import {
  createHolographicBaseRadianceCalibrationSweep,
  deriveHolographicBaseRadianceCalibrationGain,
  selectHolographicBaseRadianceCalibration,
} from "./observationCalibration.js";

const TARGET_MANIFEST_IDENTITY = "sha256:base-target-v1";

function candidate(stepIndex, overrides = {}) {
  return {
    gain: deriveHolographicBaseRadianceCalibrationGain(stepIndex),
    targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
    passesPhysicsGates: true,
    passesAntiBlackGate: true,
    passesBroadWashGate: true,
    passesLiveBaseApproval: true,
    measurementDistinguishable: true,
    headroom: {
      activeSampleCount: 1000,
      straightRadianceLuminanceP99: 0.6,
      straightRadianceMaxChannelP99: 0.9,
      overloadShare: 0.001,
    },
    ...overrides,
  };
}

function completeEvidence() {
  return [
    {
      gain: 0,
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      passesAntiBlackGate: false,
      passesLiveBaseApproval: false,
    },
    candidate(0, { passesAntiBlackGate: false }),
    candidate(1),
    candidate(2),
    candidate(3, { passesBroadWashGate: false }),
    candidate(4, { passesBroadWashGate: false }),
  ];
}

describe("holographic base radiance calibration", () => {
  it("builds an unbounded zero-plus-half-stop search around the 2^-8 seed", () => {
    const sweep = createHolographicBaseRadianceCalibrationSweep({
      minStepIndex: 0,
      maxStepIndex: 18,
    });

    expect(sweep[0]).toBe(0);
    expect(sweep[1]).toBe(HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED);
    expect(sweep[2] / sweep[1]).toBeCloseTo(Math.SQRT2, 12);
    expect(sweep.at(-1)).toBeGreaterThan(1);
  });

  it("selects the lowest passing candidate only after both brackets close", () => {
    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: completeEvidence(),
    });

    expect(result).toMatchObject({
      achieved: true,
      selectedGain: deriveHolographicBaseRadianceCalibrationGain(1),
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      reason: "lowest-passing-candidate",
    });
  });

  it("requires two consecutive broad-wash or headroom failures above the passing band", () => {
    const evidence = completeEvidence();
    evidence.at(-1).passesBroadWashGate = true;

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result).toMatchObject({
      achieved: false,
      selectedGain: null,
      reason: "incomplete-high-side-bracket",
    });
  });

  it("extends below the seed when the first positive candidate passes", () => {
    const evidence = completeEvidence();
    evidence[1] = candidate(0);

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result.reason).toBe("incomplete-low-side-bracket");
  });

  it("recomputes the exact scene-linear headroom gate from evidence metrics", () => {
    const evidence = completeEvidence();
    evidence[2] = candidate(1, {
      headroom: {
        activeSampleCount: 1000,
        straightRadianceLuminanceP99: 0.2,
        straightRadianceMaxChannelP99: 1.2,
        overloadShare: 1,
      },
    });

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result.achieved).toBe(true);
    expect(result.selectedGain).toBe(
      deriveHolographicBaseRadianceCalibrationGain(2),
    );
  });

  it("fails closed on nonfinite evidence without a legacy fallback gain", () => {
    const evidence = completeEvidence();
    evidence[2].headroom.straightRadianceLuminanceP99 = Number.NaN;

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result).toMatchObject({
      achieved: false,
      selectedGain: null,
      reason: "invalid-evidence",
    });
  });

  it("rejects mixed target-manifest identities before selection", () => {
    const evidence = completeEvidence();
    evidence[3].targetManifestIdentity = "sha256:different-target";

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result).toMatchObject({
      achieved: false,
      selectedGain: null,
      reason: "invalid-evidence",
    });
  });

  it("requires the zero canary to fail live nonblank acceptance", () => {
    const evidence = completeEvidence();
    evidence[0].passesAntiBlackGate = true;

    const result = selectHolographicBaseRadianceCalibration({
      targetManifestIdentity: TARGET_MANIFEST_IDENTITY,
      candidateMetrics: evidence,
    });

    expect(result.reason).toBe("invalid-zero-canary");
  });
});
