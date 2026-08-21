import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { getModalGeometryBackend } from "../../core/modalGeometryBackend.js";
import {
  DEFAULT_MODAL_SOURCE_PROFILE,
  buildModalSourceProfileCacheKey,
} from "../../core/modalSourceCoupling.js";
import {
  deriveCavityModalFieldCacheBandwidth,
  deriveModalFieldCacheTransferAmplitude,
} from "../../core/raymarch/fieldCachePassband.js";
import {
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
  isModalFamilyResolvedByFieldCache,
} from "../../core/raymarch/fieldCacheGeometry.js";
import { getRectangularModeShellKey } from "../../core/modalShell.js";
import {
  computeLoadedModalQualityFactor,
  resolveModalDampingApparatus,
} from "./modalDamping.js";

export const MODAL_EXCITATION_RESONANT_MIN_HZ = 200;
export const MODAL_EXCITATION_RESONANT_MIN_MODE_ORDER = 20;
const ATLAS_CACHE_MAX_SIZE = 8;
const ATLAS_CACHE = new Map();

function computeModeOrder(mode) {
  return (mode?.u ?? 0) + (mode?.v ?? 0) + (mode?.w ?? 0);
}

/**
 * Loaded quality factor from the declared apparatus loss channels.
 *
 * Deriving it from the index sum instead gave two modes at exactly the same
 * frequency different quality factors — (0,0,3) and (1,2,2) both sit at
 * 177.6 Hz and were handed 231 and 179. The current isotropic apparatus model
 * has no mode-shape-dependent loss term, so a mode's index triple cannot own
 * damping.
 *
 * The intrinsic sqrt(f) curve preserves the declared frequency trend of the
 * existing apparatus calibration. It is not derivable from the side length:
 * its coefficient is explicit because wall impedance, roughness, temperature,
 * transducer loading, and radiation loss are not measured here.
 *
 * The load contributes an approximately frequency-independent power-response
 * linewidth. It belongs in Q because the same physical loss must broaden the
 * steady response and shorten ring-up and ring-down together. Independent
 * dissipative channels add rates: 1/Q_loaded = 1/Q_intrinsic + 1/Q_load.
 */
function classifyModeLayer(modeOrder) {
  // This is an observer-policy split, not a second physical modal basis:
  // lower spatial orders follow direct source evidence, while the upper tail
  // may retain measured resonant detail. The cache-accurate centered-source
  // atlas tops out at order 28, so the legacy order-25 boundary left only two
  // detail identities. Order 20 preserves a finite six-family high-spatial-
  // complexity tail without changing modal existence, frequency, or topology.
  return modeOrder < MODAL_EXCITATION_RESONANT_MIN_MODE_ORDER
    ? "source-coupled"
    : "resonant";
}

function deriveMaximumObservedAxisOrder({
  sideLengthMeters,
  soundSpeedMetersPerSecond,
  tailMaxFrequencyHz,
}) {
  return Math.max(
    1,
    Math.ceil(
      (2 * sideLengthMeters * tailMaxFrequencyHz) / soundSpeedMetersPerSecond,
    ),
  );
}

function retainCacheCompleteShells(families) {
  const shellResolution = new Map();
  for (const family of families) {
    const shellKey = getRectangularModeShellKey(family);
    shellResolution.set(
      shellKey,
      (shellResolution.get(shellKey) ?? true) &&
        isModalFamilyResolvedByFieldCache(family),
    );
  }
  return families.filter(
    (family) =>
      shellResolution.get(getRectangularModeShellKey(family)) === true,
  );
}

function buildSourceProjectedShellAtlas(families) {
  const shells = new Map();
  for (const family of families) {
    const shellKey = getRectangularModeShellKey(family);
    const members = shells.get(shellKey) ?? [];
    members.push(family);
    shells.set(shellKey, members);
  }

  const shellProfiles = new Map();
  let maximumGeneralizedForceNorm = 0;
  for (const [shellKey, members] of shells) {
    const generalizedForceEnergy = members.reduce(
      (total, member) => total + (member.sourceGeneralizedForce ?? 0) ** 2,
      0,
    );
    const generalizedForceNorm = Math.sqrt(generalizedForceEnergy);
    maximumGeneralizedForceNorm = Math.max(
      maximumGeneralizedForceNorm,
      generalizedForceNorm,
    );
    const shellOrder = Math.max(...members.map((member) => member.order));
    const layer = classifyModeLayer(shellOrder);
    shellProfiles.set(shellKey, {
      generalizedForceEnergy,
      generalizedForceNorm,
      shellOrder,
      layer,
      memberCount: members.length,
    });
  }

  return families.map((family) => {
    const shellKey = getRectangularModeShellKey(family);
    const profile = shellProfiles.get(shellKey);
    const sourceCouplingAmplitude =
      maximumGeneralizedForceNorm > 0
        ? profile.generalizedForceNorm / maximumGeneralizedForceNorm
        : 0;
    const sourceCouplingEnergy =
      sourceCouplingAmplitude * sourceCouplingAmplitude;
    return {
      ...family,
      familyOrder: family.order,
      order: profile.shellOrder,
      responseModeKey: shellKey,
      shellMemberCount: profile.memberCount,
      shellSourceGeneralizedForceNorm: profile.generalizedForceNorm,
      sourceProjectionWeight:
        profile.generalizedForceNorm > 0
          ? family.sourceGeneralizedForce / profile.generalizedForceNorm
          : 0,
      sourceCouplingAmplitude,
      sourceCouplingEnergy,
      layer: profile.layer,
      renderLayer: profile.layer,
    };
  });
}

/**
 * Normalize the acoustic apparatus shared by atlas construction and live modal
 * drive analysis. Visual radius never substitutes for acoustic side length:
 * an omitted or partial scale resolves against the one declared water-cavity
 * apparatus, and an omitted boundary resolves to its rigid-wall Neumann basis.
 */
export function resolveModalExcitationApparatus({
  radius,
  cavityAcousticScale,
  boundaryMode,
}) {
  const safeRadius = Math.max(0.1, Math.round(radius * 1000) / 1000);
  const sideLengthMeters =
    Number.isFinite(cavityAcousticScale?.sideLengthMeters) &&
    cavityAcousticScale.sideLengthMeters > 0
      ? Math.round(cavityAcousticScale.sideLengthMeters * 1000) / 1000
      : CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters;
  const soundSpeedMetersPerSecond =
    Number.isFinite(cavityAcousticScale?.soundSpeedMetersPerSecond) &&
    cavityAcousticScale.soundSpeedMetersPerSecond > 0
      ? Math.round(cavityAcousticScale.soundSpeedMetersPerSecond * 1000) / 1000
      : CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond;
  const resolvedBoundaryMode =
    boundaryMode === "dirichlet" ? "dirichlet" : "neumann";
  const dampingApparatus = resolveModalDampingApparatus(cavityAcousticScale);

  return {
    safeRadius,
    sideLengthMeters,
    soundSpeedMetersPerSecond,
    boundaryMode: resolvedBoundaryMode,
    ...dampingApparatus,
  };
}

/**
 * Build the finite spatial modal representation.
 *
 * The physical cavity spectrum is unbounded. This atlas is deliberately not:
 * it retains only complete centered-source eigenvalue shells whose
 * numerical cache-passband transfer remains above the declared tail and
 * whose every source-supported family has a quadratic radiation potential
 * resolved by the production field cache. A shell with even one unresolved
 * family is rejected rather than rotating its source-projected eigenfunction
 * by truncation. Higher-frequency audio remains available to the independent
 * spectral lane and must not create unsupported spatial identities.
 */
export function buildModalExcitationAtlas({
  radius,
  cavityGeometry = "rectangular",
  cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
  boundaryMode = null,
  sourceProfile = DEFAULT_MODAL_SOURCE_PROFILE,
}) {
  const apparatus = resolveModalExcitationApparatus({
    radius,
    cavityAcousticScale,
    boundaryMode,
  });
  const {
    safeRadius,
    sideLengthMeters: acousticSideLength,
    soundSpeedMetersPerSecond: acousticSoundSpeed,
    modalIntrinsicQualityFactorAt100Hz,
    modalLoadLinewidthHz,
  } = apparatus;
  const observationBand = deriveCavityModalFieldCacheBandwidth({
    sideLengthMeters: acousticSideLength,
    soundSpeedMetersPerSecond: acousticSoundSpeed,
    boundaryMode: apparatus.boundaryMode,
  });
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const cacheKey = [
    geometryBackend.cavityGeometry,
    apparatus.boundaryMode,
    acousticSideLength.toFixed(3),
    acousticSoundSpeed.toFixed(3),
    modalIntrinsicQualityFactorAt100Hz.toFixed(3),
    modalLoadLinewidthHz.toFixed(3),
    FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER.toFixed(6),
    buildModalSourceProfileCacheKey(sourceProfile),
  ].join(":");
  const cached = ATLAS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const maximumObservedAxisOrder = deriveMaximumObservedAxisOrder({
    sideLengthMeters: acousticSideLength,
    soundSpeedMetersPerSecond: acousticSoundSpeed,
    tailMaxFrequencyHz: observationBand.tailMaxFrequencyHz,
  });
  const observationEligibleFamilies = geometryBackend
    .enumerateAtlasCandidates({
      radius: safeRadius,
      acousticScale: {
        ...cavityAcousticScale,
        sideLengthMeters: acousticSideLength,
        soundSpeedMetersPerSecond: acousticSoundSpeed,
      },
      boundaryMode: apparatus.boundaryMode,
      maximumAxisOrder: maximumObservedAxisOrder,
    })
    .map((candidate) => {
      const modeKey = `${candidate.u}:${candidate.v}:${candidate.w}`;
      const naturalFrequencyHz = candidate.naturalFrequencyHz;
      const order = computeModeOrder(candidate);
      const qualityFactor = computeLoadedModalQualityFactor({
        naturalFrequencyHz,
        modalIntrinsicQualityFactorAt100Hz,
        modalLoadLinewidthHz,
      });
      const sourceCoupling = geometryBackend.computeSourceCoupling({
        u: candidate.u,
        v: candidate.v,
        w: candidate.w,
        boundaryMode: apparatus.boundaryMode,
        sourceProfile,
      });
      return {
        modeKey,
        familyId: `family:${modeKey}`,
        u: candidate.u,
        v: candidate.v,
        w: candidate.w,
        naturalFrequencyHz,
        order,
        sourceCouplingAmplitude: sourceCoupling.couplingAmplitude,
        sourceCouplingEnergy: sourceCoupling.couplingEnergy,
        sourceGeneralizedForce: sourceCoupling.generalizedForce,
        sourceSupported: sourceCoupling.sourceSupported,
        qualityFactor,
      };
    })
    .filter((entry) => {
      const spatialWavenumber = Math.hypot(entry.u, entry.v, entry.w);
      return (
        entry.sourceSupported &&
        entry.naturalFrequencyHz <= observationBand.tailMaxFrequencyHz &&
        deriveModalFieldCacheTransferAmplitude(spatialWavenumber) >=
          observationBand.tailTransferAmplitude
      );
    });
  const families = retainCacheCompleteShells(observationEligibleFamilies).sort(
    (left, right) =>
      left.naturalFrequencyHz - right.naturalFrequencyHz ||
      left.u - right.u ||
      left.v - right.v ||
      left.w - right.w,
  );
  const atlas = buildSourceProjectedShellAtlas(families);
  ATLAS_CACHE.set(cacheKey, atlas);
  if (ATLAS_CACHE.size > ATLAS_CACHE_MAX_SIZE) {
    const oldestKey = ATLAS_CACHE.keys().next().value;
    ATLAS_CACHE.delete(oldestKey);
  }
  return atlas;
}
