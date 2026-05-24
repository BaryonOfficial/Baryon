import { float } from "three/tsl";
import {
  getCavityModeFrequency,
  resolveCavityModeFamilyForPitch,
  sampleFFTAmplitudeForFrequency,
} from "../utils/cavityModes.js";
import {
  evaluatePermutationFamilyMode,
  getUniquePermutationCount,
  normalizeBoundaryMode,
} from "./modeFamily.js";
import { evaluatePermutationFamilyNodeForBoundary } from "./modeFamilyNode.js";
import { resolveEffectiveCavityGeometry } from "./cavityGeometry.js";

const RECTANGULAR_MODE_BACKEND = Object.freeze({
  cavityGeometry: "rectangular",
  buildAtlas({
    radius,
    acousticScale = null,
    boundaryMode = null,
    frequencyCenters,
    buildModeKey,
    createAtlasEntry,
  }) {
    const entriesByKey = new Map();
    const modeOptions = resolveModalSolveOptions({
      radius,
      acousticScale,
      boundaryMode,
    });

    for (const entry of frequencyCenters) {
      const centerHz =
        typeof entry === "number" ? entry : Number(entry?.centerHz ?? 0);
      const familyWidth =
        typeof entry === "number" ? 1 : Number(entry?.familyWidth ?? 1);
      const family = resolveCavityModeFamilyForPitch(
        centerHz,
        modeOptions,
        familyWidth,
      );
      for (const candidate of family) {
        const modeKey = buildModeKey(candidate.u, candidate.v, candidate.w);
        if (entriesByKey.has(modeKey)) {
          continue;
        }

        const naturalFrequencyHz = getCavityModeFrequency(
          candidate.u,
          candidate.v,
          candidate.w,
          modeOptions,
        );
        entriesByKey.set(
          modeKey,
          createAtlasEntry({
            candidate,
            modeKey,
            naturalFrequencyHz,
          }),
        );
      }
    }

    return Array.from(entriesByKey.values()).sort(
      (left, right) => left.naturalFrequencyHz - right.naturalFrequencyHz,
    );
  },
  solveTermsForPitch({ pitch, radius, acousticScale = null, boundaryMode, count }) {
    return resolveCavityModeFamilyForPitch(
      pitch,
      resolveModalSolveOptions({ radius, acousticScale, boundaryMode }),
      count,
    );
  },
  evaluateMode({ u, v, w, x, y, z, scale, boundaryMode }) {
    return evaluatePermutationFamilyMode({
      u,
      v,
      w,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
  },
  evaluateModeNode({
    u,
    v,
    w,
    xCoord,
    yCoord,
    zCoord,
    scale = null,
    uRadius = null,
    boundaryMode,
  }) {
    return evaluatePermutationFamilyNodeForBoundary({
      u,
      v,
      w,
      xCoord,
      yCoord,
      zCoord,
      scale: scale ?? float(Math.PI).div(uRadius.max(float(1e-4))),
      boundaryMode,
    });
  },
  getSlotEvaluationCost(slots, offset) {
    return getUniquePermutationCount(
      slots?.[offset] ?? 0,
      slots?.[offset + 1] ?? 0,
      slots?.[offset + 2] ?? 0,
    );
  },
});

function resolveModalSolveOptions({ radius, acousticScale, boundaryMode }) {
  const normalizedBoundaryMode =
    boundaryMode == null ? null : normalizeBoundaryMode(boundaryMode);
  if (acousticScale) {
    return {
      acousticScale,
      boundaryMode: normalizedBoundaryMode ?? "neumann",
    };
  }
  if (normalizedBoundaryMode) {
    return {
      acousticScale: {
        radiusMeters: radius,
      },
      boundaryMode: normalizedBoundaryMode,
    };
  }
  return radius;
}

export function getModalGeometryBackend(requestedGeometry) {
  const effectiveGeometry = resolveEffectiveCavityGeometry(requestedGeometry);
  switch (effectiveGeometry) {
    case "rectangular":
    default:
      return RECTANGULAR_MODE_BACKEND;
  }
}

export { sampleFFTAmplitudeForFrequency };
