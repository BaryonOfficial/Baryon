import { describe, expect, it } from "vitest";

import {
  CAVITY_ACOUSTIC_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../../defaults.js";
import {
  FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE,
  deriveCavityModalFieldCacheBandwidth,
  deriveModalFieldCacheTransferAmplitude,
} from "../../core/raymarch/fieldCachePassband.js";
import {
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
  isModalFamilyResolvedByFieldCache,
} from "../../core/raymarch/fieldCacheGeometry.js";
import {
  MODAL_EXCITATION_RESONANT_MIN_MODE_ORDER,
  buildModalExcitationAtlas,
} from "./modalExcitationAtlas.js";

function buildAtlasForRadius(radius) {
  return buildModalExcitationAtlas({
    radius,
    cavityGeometry: "rectangular",
    boundaryMode: "neumann",
  });
}

function buildAtlasForAcousticSideLength(sideLengthMeters) {
  return buildModalExcitationAtlas({
    radius: SIMULATION_DEFAULTS.radius,
    cavityGeometry: "rectangular",
    cavityAcousticScale: {
      ...CAVITY_ACOUSTIC_DEFAULTS,
      sideLengthMeters,
    },
    boundaryMode: "neumann",
  });
}

describe("modal excitation atlas", () => {
  it("derives natural frequencies from acoustic scale rather than visual radius", () => {
    const atlas = buildModalExcitationAtlas({
      radius: 3,
      cavityGeometry: "rectangular",
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: "neumann",
    });
    const floorEntry = atlas.find(
      (entry) => entry.u === 0 && entry.v === 0 && entry.w === 2,
    );

    expect(floorEntry?.naturalFrequencyHz).toBeCloseTo(118.4, 1);
  });

  it("admits only optically supported, cache-resolved spatial topology", () => {
    const atlas = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: SIMULATION_DEFAULTS.cavityGeometry,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    });
    const observationBand = deriveCavityModalFieldCacheBandwidth({
      sideLengthMeters: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
      soundSpeedMetersPerSecond:
        CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    });
    const transfers = atlas.map((entry) =>
      deriveModalFieldCacheTransferAmplitude(
        Math.hypot(entry.u, entry.v, entry.w),
      ),
    );

    expect(atlas.length).toBeGreaterThan(0);
    expect(
      atlas.every(
        (entry) =>
          entry.naturalFrequencyHz <=
          observationBand.tailMaxFrequencyHz + Number.EPSILON,
      ),
    ).toBe(true);
    expect(
      transfers.every(
        (transfer) => transfer >= FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE,
      ),
    ).toBe(true);
    expect(
      atlas.every((entry) => isModalFamilyResolvedByFieldCache(entry)),
    ).toBe(true);
    expect(
      Math.max(...atlas.flatMap((entry) => [entry.u, entry.v, entry.w])),
    ).toBeLessThanOrEqual(FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER);

    // Optical support and numerical representability are separate boundaries:
    // this axial mode survives the apparatus aperture but its doubled
    // potential frequency cannot be represented accurately by the cache.
    expect(deriveModalFieldCacheTransferAmplitude(18)).toBeGreaterThan(
      FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE,
    );
    expect(isModalFamilyResolvedByFieldCache({ u: 0, v: 0, w: 18 })).toBe(
      false,
    );
  });

  it("publishes the complete cache-resolved source basis as normalized eigenvalue shells", () => {
    const atlas = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: SIMULATION_DEFAULTS.cavityGeometry,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    });
    const shells = new Map();
    for (const entry of atlas) {
      const members = shells.get(entry.responseModeKey) ?? [];
      members.push(entry);
      shells.set(entry.responseModeKey, members);
    }

    expect(atlas).toHaveLength(85);
    expect(shells.size).toBe(59);
    expect(shells.has("rect:196")).toBe(true);
    // rect:260 also contains (0,2,16), whose quadratic potential falls
    // outside the declared cache-accuracy boundary. Keeping only its
    // cache-resolved (0,8,14) and (4,10,12) members would rotate the
    // source-projected
    // eigenfunction, so the whole exact shell must stay out.
    expect(shells.has("rect:260")).toBe(false);
    expect(
      Math.max(...Array.from(shells.values(), (members) => members.length)),
    ).toBe(3);
    for (const [shellKey, members] of shells) {
      expect(shellKey).toBe(members[0].responseModeKey);
      expect(
        members.reduce(
          (total, member) => total + member.sourceProjectionWeight ** 2,
          0,
        ),
      ).toBeCloseTo(1, 12);
      expect(new Set(members.map((member) => member.layer)).size).toBe(1);
      expect(
        new Set(
          members.map((member) => Math.sign(member.sourceProjectionWeight)),
        ).size,
      ).toBe(1);
      expect(
        members.every(
          (member) =>
            member.shellMemberCount === members.length &&
            member.sourceCouplingEnergy === members[0].sourceCouplingEnergy,
        ),
      ).toBe(true);
    }
  });

  it("reserves a finite high-spatial-order tail for resonant observation", () => {
    const atlas = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: SIMULATION_DEFAULTS.cavityGeometry,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    });

    expect(
      atlas.every(
        (entry) =>
          entry.layer ===
          (entry.order < MODAL_EXCITATION_RESONANT_MIN_MODE_ORDER
            ? "source-coupled"
            : "resonant"),
      ),
    ).toBe(true);
    expect(
      atlas.filter((entry) => entry.layer === "source-coupled").length,
    ).toBeGreaterThan(0);
    expect(
      atlas.filter((entry) => entry.layer === "resonant").length,
    ).toBeGreaterThan(4);
  });

  it("reuses an atlas for inputs with the same normalized cache identity", () => {
    expect(buildAtlasForRadius(2.0004)).toBe(buildAtlasForRadius(2.00049));
  });

  it("defaults every atlas call to the canonical Neumann acoustic apparatus", () => {
    const implicitApparatus = buildModalExcitationAtlas({
      radius: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
      cavityGeometry: "rectangular",
    });
    const explicitApparatus = buildModalExcitationAtlas({
      radius: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
      cavityGeometry: "rectangular",
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    });

    expect(implicitApparatus).toBe(explicitApparatus);
    expect(implicitApparatus[0]?.naturalFrequencyHz).toBeCloseTo(118.4, 1);
  });

  it("derives bounded source coupling from the declared spatial source profile", () => {
    const atlas = buildAtlasForRadius(3);
    const couplingEnergies = atlas.map((entry) => entry.sourceCouplingEnergy);

    expect(
      atlas.every(
        (entry) =>
          Number.isFinite(entry.sourceCouplingAmplitude) &&
          Math.abs(
            entry.sourceCouplingAmplitude ** 2 - entry.sourceCouplingEnergy,
          ) < 1e-12 &&
          !Object.hasOwn(entry, "driveWeight"),
      ),
    ).toBe(true);
    expect(couplingEnergies.every((energy) => energy > 0 && energy <= 1)).toBe(
      true,
    );
    expect(Math.min(...couplingEnergies)).toBeGreaterThan(0);
    expect(
      atlas.every(
        (entry) =>
          entry.sourceSupported &&
          entry.u % 2 === 0 &&
          entry.v % 2 === 0 &&
          entry.w % 2 === 0,
      ),
    ).toBe(true);
    expect(
      atlas.some((entry) => Math.abs(entry.sourceGeneralizedForce) > 0),
    ).toBe(true);
  });

  it("retains absolute shell generalized-force ratios under one source calibration", () => {
    const atlas = buildAtlasForRadius(3);
    const shells = Array.from(
      Map.groupBy(atlas, (entry) => entry.responseModeKey).values(),
    );
    const weakest = shells.reduce((best, members) =>
      members[0].shellSourceGeneralizedForceNorm <
      best[0].shellSourceGeneralizedForceNorm
        ? members
        : best,
    );
    const strongest = shells.reduce((best, members) =>
      members[0].shellSourceGeneralizedForceNorm >
      best[0].shellSourceGeneralizedForceNorm
        ? members
        : best,
    );

    expect(
      strongest[0].sourceCouplingAmplitude /
        weakest[0].sourceCouplingAmplitude,
    ).toBeCloseTo(
      strongest[0].shellSourceGeneralizedForceNorm /
        weakest[0].shellSourceGeneralizedForceNorm,
      6,
    );
  });

  it("evicts the oldest atlas when the bounded cache is full", () => {
    const oldest = buildAtlasForAcousticSideLength(10);
    for (let index = 1; index <= 8; index += 1) {
      buildAtlasForAcousticSideLength(10 + index * 0.1);
    }

    expect(buildAtlasForAcousticSideLength(10)).not.toBe(oldest);
  });
});

describe("modal quality factor", () => {
  const atlas = buildModalExcitationAtlas({
    radius: SIMULATION_DEFAULTS.radius,
    cavityGeometry: SIMULATION_DEFAULTS.cavityGeometry,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
  });

  function nearest(frequencyHz) {
    return atlas.reduce((best, entry) =>
      Math.abs(entry.naturalFrequencyHz - frequencyHz) <
      Math.abs(best.naturalFrequencyHz - frequencyHz)
        ? entry
        : best,
    );
  }

  it("gives degenerate modes the same quality factor", () => {
    // Find one pair of distinct centered-source-supported families with the
    // same eigenfrequency. This isotropic virtual load is frequency-only, so
    // an accidental degeneracy cannot receive two different calibrations from
    // index sum.
    const entriesByFrequency = new Map();
    for (const entry of atlas) {
      const key = entry.naturalFrequencyHz.toFixed(6);
      const entries = entriesByFrequency.get(key) ?? [];
      entries.push(entry);
      entriesByFrequency.set(key, entries);
    }
    const degenerate =
      Array.from(entriesByFrequency.values()).find(
        (entries) =>
          entries.length > 1 &&
          new Set(entries.map((entry) => entry.familyOrder)).size > 1,
      ) ?? [];

    expect(degenerate.length).toBeGreaterThan(1);
    for (const entry of degenerate) {
      expect(entry.qualityFactor).toBeCloseTo(degenerate[0].qualityFactor, 6);
      expect(entry.order).toBeGreaterThan(0);
    }
    expect(
      new Set(degenerate.map((entry) => entry.familyOrder)).size,
    ).toBeGreaterThan(1);
  });

  it("keeps the declared intrinsic loss curve on its square-root law", () => {
    const intrinsicAtlas = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: "rectangular",
      cavityAcousticScale: {
        ...CAVITY_ACOUSTIC_DEFAULTS,
        modalLoadLinewidthHz: 0.001,
      },
      boundaryMode: "neumann",
    });
    const nearestIntrinsic = (frequencyHz) =>
      intrinsicAtlas.reduce((best, entry) =>
        Math.abs(entry.naturalFrequencyHz - frequencyHz) <
        Math.abs(best.naturalFrequencyHz - frequencyHz)
          ? entry
          : best,
      );
    const low = nearestIntrinsic(118.4);
    const high = nearestIntrinsic(236.8);

    expect(high.qualityFactor / low.qualityFactor).toBeCloseTo(Math.SQRT2, 2);
  });

  it("loads every mode with enough physical bandwidth for a realtime instrument", () => {
    // The idealized boundary layer is an unloaded loss estimate. The rendered
    // apparatus also has wall/support loading, represented as an independent
    // loss channel with at least 7 Hz power bandwidth. Independent loss rates
    // add, so the loaded mode can never be narrower or slower than this.
    for (const frequencyHz of [59.2, 118.4, 958, 7611]) {
      const entry = nearest(frequencyHz);
      const linewidthHz =
        entry.naturalFrequencyHz / Math.max(entry.qualityFactor, 1e-9);
      const amplitudeTauMs =
        (entry.qualityFactor /
          (Math.PI * Math.max(entry.naturalFrequencyHz, 1e-9))) *
        1000;

      expect(linewidthHz).toBeGreaterThanOrEqual(
        CAVITY_ACOUSTIC_DEFAULTS.modalLoadLinewidthHz,
      );
      expect(amplitudeTauMs).toBeLessThanOrEqual(
        1000 / (Math.PI * CAVITY_ACOUSTIC_DEFAULTS.modalLoadLinewidthHz),
      );
    }
  });

  it("adds independent boundary and apparatus loss rates reciprocally", () => {
    for (const frequencyHz of [59.2, 118.4, 958, 7611]) {
      const entry = nearest(frequencyHz);
      const intrinsicQualityFactor =
        CAVITY_ACOUSTIC_DEFAULTS.modalIntrinsicQualityFactorAt100Hz *
        Math.sqrt(entry.naturalFrequencyHz / 100);
      const loadQualityFactor =
        entry.naturalFrequencyHz /
        CAVITY_ACOUSTIC_DEFAULTS.modalLoadLinewidthHz;
      const expectedLoadedQuality =
        1 / (1 / intrinsicQualityFactor + 1 / loadQualityFactor);

      expect(entry.qualityFactor).toBeCloseTo(expectedLoadedQuality, 10);
      expect(entry.qualityFactor).toBeLessThan(intrinsicQualityFactor);
      expect(entry.qualityFactor).toBeLessThan(loadQualityFactor);
    }
  });

  it("includes damping calibration in the atlas cache identity", () => {
    const lightlyLoaded = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: "rectangular",
      cavityAcousticScale: {
        ...CAVITY_ACOUSTIC_DEFAULTS,
        modalLoadLinewidthHz: 2,
      },
      boundaryMode: "neumann",
    });
    const stronglyLoaded = buildModalExcitationAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: "rectangular",
      cavityAcousticScale: {
        ...CAVITY_ACOUSTIC_DEFAULTS,
        modalLoadLinewidthHz: 14,
      },
      boundaryMode: "neumann",
    });

    expect(lightlyLoaded).not.toBe(stronglyLoaded);
    expect(lightlyLoaded[0].qualityFactor).toBeGreaterThan(
      stronglyLoaded[0].qualityFactor,
    );
  });

  it("does not serialize observer lifetime into physical atlas modes", () => {
    expect(atlas.every((entry) => !Object.hasOwn(entry, "decayTauMs"))).toBe(
      true,
    );
  });
});
