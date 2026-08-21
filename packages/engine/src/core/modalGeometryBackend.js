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
import { computeRectangularModalSourceCoupling } from "./modalSourceCoupling.js";
import {
  evaluatePermutationFamilyAxisPathIntegratedHessiansNodeForBoundary,
  evaluatePermutationFamilyFieldNodeForBoundary,
  evaluatePermutationFamilyNodeForBoundary,
} from "./modeFamilyNode.js";
import { resolveEffectiveCavityGeometry } from "./cavityGeometry.js";
import {
  readModalTopologyMode,
  summarizeModalSlotTopologyRange,
  summarizeModalTopology,
} from "./modalTopology.js";
import { getRectangularModeShellKey } from "./modalShell.js";

function getRectangularModeFamilyKey(source) {
  return readModalTopologyMode(source)
    .map(Math.abs)
    .sort((left, right) => left - right)
    .join(":");
}

function summarizeRectangularModalTopology(records, options = {}) {
  return summarizeModalTopology(records, {
    getShellKey: getRectangularModeShellKey,
    getFamilyKey: getRectangularModeFamilyKey,
    ...options,
  });
}

function summarizeRectangularModalSlotTopologyRange(slots, options = {}) {
  return summarizeModalSlotTopologyRange(slots, {
    getShellKey: getRectangularModeShellKey,
    getFamilyKey: getRectangularModeFamilyKey,
    ...options,
  });
}

const RECTANGULAR_MODE_BACKEND = Object.freeze({
  cavityGeometry: "rectangular",
  getModeShellKey: getRectangularModeShellKey,
  getModeFamilyKey: getRectangularModeFamilyKey,
  summarizeModalTopology: summarizeRectangularModalTopology,
  summarizeModalSlotTopologyRange: summarizeRectangularModalSlotTopologyRange,
  enumerateAtlasCandidates({
    radius,
    acousticScale = null,
    boundaryMode = null,
    maximumAxisOrder,
  }) {
    const modeOptions = resolveModalSolveOptions({
      radius,
      acousticScale,
      boundaryMode,
    });
    const maximumOrder = Math.max(0, Math.floor(maximumAxisOrder ?? 0));
    const minimumOrder =
      normalizeBoundaryMode(modeOptions.boundaryMode) === "dirichlet" ? 1 : 0;
    const candidates = [];

    for (let u = minimumOrder; u <= maximumOrder; u += 1) {
      for (let v = u; v <= maximumOrder; v += 1) {
        for (let w = v; w <= maximumOrder; w += 1) {
          if (u === 0 && v === 0 && w === 0) {
            continue;
          }
          candidates.push({
            u,
            v,
            w,
            naturalFrequencyHz: getCavityModeFrequency(u, v, w, modeOptions),
          });
        }
      }
    }
    return candidates;
  },
  solveTermsForPitch({
    pitch,
    radius,
    acousticScale = null,
    boundaryMode,
    count,
  }) {
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
  computeSourceCoupling({ u, v, w, boundaryMode, sourceProfile }) {
    return computeRectangularModalSourceCoupling({
      u,
      v,
      w,
      boundaryMode,
      sourceProfile,
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
  evaluateModeAxisPathIntegratedHessiansNode({
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
    return evaluatePermutationFamilyAxisPathIntegratedHessiansNodeForBoundary({
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
  evaluateFieldNode({
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
    return evaluatePermutationFamilyFieldNodeForBoundary({
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
        sideLengthMeters: radius,
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
