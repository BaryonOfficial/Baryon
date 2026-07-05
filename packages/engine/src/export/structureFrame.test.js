import { describe, expect, it } from "vitest";
import { buildCanonicalFullModalDescriptor } from "../core/modalDescriptor.js";
import {
  DEFAULT_STRUCTURE_FRAME_MODE_CAP,
  MAX_STRUCTURE_FRAME_MODE_CAP,
  STRUCTURE_FRAME_OSC_SCHEMA,
  STRUCTURE_FRAME_SCHEMA_VERSION,
  normalizeStructureFrameModeCap,
  projectStructureFrame,
} from "./structureFrame.js";

function makeSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([u, v, w, amplitude], index) => {
    const offset = index * 4;
    slots[offset] = u;
    slots[offset + 1] = v;
    slots[offset + 2] = w;
    slots[offset + 3] = amplitude;
  });
  return slots;
}

function makePhaseSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([offsetRad, velocity, coherence, authority], index) => {
    const offset = index * 4;
    slots[offset] = offsetRad;
    slots[offset + 1] = velocity;
    slots[offset + 2] = coherence;
    slots[offset + 3] = authority;
  });
  return slots;
}

function makeColorSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([r, g, b, weight], index) => {
    const offset = index * 4;
    slots[offset] = r;
    slots[offset + 1] = g;
    slots[offset + 2] = b;
    slots[offset + 3] = weight;
  });
  return slots;
}

function makeMetadataSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(
    (
      [naturalFrequencyHz, qualityFactor, dampingRatio, observedSupport],
      index,
    ) => {
      const offset = index * 4;
      slots[offset] = naturalFrequencyHz;
      slots[offset + 1] = qualityFactor;
      slots[offset + 2] = dampingRatio;
      slots[offset + 3] = observedSupport;
    },
  );
  return slots;
}

function createFeatureFrame({
  descriptor,
  frameSequence = 10,
  overrides = {},
} = {}) {
  return {
    frameSequence,
    frameTimeMs: 123.4,
    requestedCavityGeometry: "spherical",
    effectiveCavityGeometry: "rectangular",
    rms: 0.31,
    dominantFrequency: 220,
    spectralCentroid: 880,
    structureSignal: 0.42,
    energySignal: 0.53,
    changeSignal: 0.64,
    pulseSignal: 0.75,
    modalDescriptor: descriptor,
    ...overrides,
  };
}

describe("projectStructureFrame", () => {
  it("publishes a single OSC schema for encoder and TouchDesigner consumers", () => {
    const modeColumns = [
      "index",
      ...STRUCTURE_FRAME_OSC_SCHEMA.packets.modes.flatMap((packet) =>
        packet.args.map((arg) => arg.column),
      ),
    ];
    const frameValueCount = STRUCTURE_FRAME_OSC_SCHEMA.packets.frame.reduce(
      (count, packet) => count + packet.args.length,
      0,
    );
    const modeValueCount = STRUCTURE_FRAME_OSC_SCHEMA.packets.modes.reduce(
      (count, packet) => count + packet.args.length,
      0,
    );

    expect(STRUCTURE_FRAME_OSC_SCHEMA.schemaVersion).toBe(
      STRUCTURE_FRAME_SCHEMA_VERSION,
    );
    expect(STRUCTURE_FRAME_OSC_SCHEMA.tables.modes.columns).toEqual(
      modeColumns,
    );
    expect(
      STRUCTURE_FRAME_OSC_SCHEMA.tables.colors.columns.every((column) =>
        STRUCTURE_FRAME_OSC_SCHEMA.tables.modes.columns.includes(column),
      ),
    ).toBe(true);
    expect(frameValueCount).toBe(30);
    expect(modeValueCount).toBe(18);
  });

  it("projects descriptor modes into a bounded v1 public frame", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      modalFieldSlots: makeSlots([
        [1, 2, 3, 0.6],
        [4, 5, 6, 0.3],
      ]),
      modalFieldPhaseSlots: makePhaseSlots([
        [0.1, 0.2, 0.8, 0.9],
        [0.3, 0.4, 0.5, 0.6],
      ]),
      modalFieldColorSlots: makeColorSlots([
        [0.2, 0.4, 0.6, 0.8],
        [0.7, 0.5, 0.3, 0.4],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [440, 12, 0.03, 0.9],
        [880, 18, 0.05, 0.5],
      ]),
      activeModalFieldModeCount: 2,
    });
    const featureFrame = createFeatureFrame({ descriptor });

    const projected = projectStructureFrame(featureFrame, {
      frameSequence: 77,
      modeCap: 1,
      controls: {
        colorMode: "spectral",
        volumeColor: "#336699",
        surfaceColor: "#f7fdff",
      },
    });

    expect(projected).toMatchObject({
      schemaVersion: STRUCTURE_FRAME_SCHEMA_VERSION,
      frameSequence: 77,
      frameTimeMs: 123.4,
      sourceState: "active",
      fieldAuthority: "complete",
      requestedCavityGeometry: "spherical",
      effectiveCavityGeometry: "rectangular",
      modeCount: 1,
      material: {
        colorMode: "spectral",
        volumeColorRgb: [
          expect.closeTo(0.2, 6),
          expect.closeTo(0.4, 6),
          expect.closeTo(0.6, 6),
        ],
        surfaceColorRgb: [
          expect.closeTo(247 / 255, 6),
          expect.closeTo(253 / 255, 6),
          expect.closeTo(1, 6),
        ],
      },
      global: {
        rms: 0.31,
        dominantFrequencyHz: 220,
        spectralCentroidHz: 880,
        structureSignal: 0.42,
        energySignal: 0.53,
        changeSignal: 0.64,
        pulseSignal: 0.75,
      },
    });
    expect(projected.modes).toHaveLength(1);
    expect(projected.modes[0]).toMatchObject({
      index: 0,
      modeKey: "1:2:3",
      u: 1,
      v: 2,
      w: 3,
      coefficient: expect.closeTo(0.6, 6),
      coefficientEnergy: expect.closeTo(0.36, 6),
      phaseOffsetRad: expect.closeTo(0.1, 6),
      phaseVelocityRadPerSec: expect.closeTo(0.2, 6),
      phaseCoherence: expect.closeTo(0.8, 6),
      phaseAuthority: expect.closeTo(0.9, 6),
      naturalFrequencyHz: 440,
      qualityFactor: 12,
      dampingRatio: expect.closeTo(0.03, 6),
      observedSupport: expect.closeTo(0.9, 6),
      material: {
        colorRgb: [
          expect.closeTo(0.2, 6),
          expect.closeTo(0.4, 6),
          expect.closeTo(0.6, 6),
        ],
        colorWeight: expect.closeTo(0.8, 6),
      },
    });
  });

  it("exports bandwidth-limited zero-mode frames as active coverage diagnostics", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      basisAtlasPageCapacity: 4,
      modalFieldSlots: makeSlots([
        [2, 3, 5, 0.2],
        [3, 4, 6, 0.1],
      ]),
      activeModalFieldModeCount: 2,
      overBandwidthRejectedModeCount: 3,
      overBandwidthRejectedModalEnergy: 0.4,
      overBandwidthMaxRequestedModeIndex: 184,
      overBandwidthMaxRequestedMode: [56, 64, 184],
    });

    const projected = projectStructureFrame(createFeatureFrame({ descriptor }));

    expect(projected.sourceState).toBe("active");
    expect(projected.fieldAuthority).toBe("bandwidth-limited");
    expect(projected.modeCount).toBe(0);
    expect(projected.modes).toEqual([]);
    expect(projected.coverage).toMatchObject({
      structuralCoverageSatisfied: false,
      semanticModeCount: 2,
      representedBasisPageModeCount: 2,
      rejectedModalEnergy: expect.closeTo(0.4, 6),
      overBandwidthRejectedModeCount: 3,
      overBandwidthDominant: true,
    });
  });

  it("returns explicit idle frames when a feature frame has no modal descriptor", () => {
    const projected = projectStructureFrame(
      createFeatureFrame({ descriptor: null }),
      {
        controls: {
          colorMode: "static",
          volumeColor: "#000000",
          surfaceColor: "#ffffff",
        },
      },
    );

    expect(projected).toMatchObject({
      sourceState: "idle",
      fieldAuthority: "complete",
      modeCount: 0,
      modes: [],
      coverage: {
        structuralCoverageSatisfied: false,
        semanticModeCount: 0,
        representedBasisPageModeCount: 0,
        renderRepresentedEnergyRatio: 0,
      },
    });
  });

  it("uses current feature-frame diagnostics without leaking descriptor internals", () => {
    const descriptor = {
      fieldAuthority: "complete",
      counts: {
        validModeCount: 1,
        modalFieldModeCount: 1,
      },
      diagnostics: {
        structuralCoverageSatisfied: true,
      },
      modes: {
        modalField: [
          {
            modeKey: "7:8:9",
            u: 7,
            v: 8,
            w: 9,
            coefficient: -0.25,
          },
        ],
      },
      slotViews: {
        modalFieldSlots: new Float32Array([7, 8, 9, -0.25]),
      },
    };
    const projected = projectStructureFrame(
      createFeatureFrame({
        descriptor,
        overrides: {
          rms: undefined,
          averageAmplitude: 0.19,
          dominantFrequency: undefined,
          requestedCavityGeometry: undefined,
          effectiveCavityGeometry: undefined,
          debug: {
            requestedCavityGeometry: "spherical",
            effectiveCavityGeometry: "rectangular",
            dominantFrequencyHz: 330,
          },
        },
      }),
    );

    expect(projected.global.rms).toBe(0.19);
    expect(projected.global.dominantFrequencyHz).toBe(330);
    expect(projected.requestedCavityGeometry).toBe("spherical");
    expect(projected.effectiveCavityGeometry).toBe("rectangular");
    expect(projected.modes[0].coefficient).toBeCloseTo(-0.25, 6);
    expect(projected.modes[0].coefficientEnergy).toBeCloseTo(0.0625, 6);
    expect(projected).not.toHaveProperty("modalDescriptor");
    expect(projected).not.toHaveProperty("slotViews");
    expect(projected.modes[0]).not.toHaveProperty("slotOffset");
  });

  it("projects live diagnostic aliases only when canonical signals are absent", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      modalFieldSlots: makeSlots([[1, 2, 3, 0.6]]),
      activeModalFieldModeCount: 1,
    });
    const projected = projectStructureFrame(
      createFeatureFrame({
        descriptor,
        overrides: {
          rms: undefined,
          averageAmplitude: undefined,
          dominantFrequency: undefined,
          spectralCentroid: undefined,
          structureSignal: undefined,
          energySignal: undefined,
          changeSignal: undefined,
          pulseSignal: undefined,
          debug: {
            analyserRms: 0.044,
            avgAmplitude: 13.25,
            dominantFrequencyHz: 440,
            spectralCentroidHz: 1320,
            structureSignal: 0.28,
            energySignal: 0.4,
            changeSignal: 0.52,
            pulseSignal: 0.64,
          },
        },
      }),
    );

    expect(projected.global).toMatchObject({
      rms: 0.044,
      dominantFrequencyHz: 440,
      spectralCentroidHz: 1320,
      structureSignal: 0.28,
      energySignal: 0.4,
      changeSignal: 0.52,
      pulseSignal: 0.64,
    });
  });

  it("does not mutate feature frames or descriptors while applying export caps", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.5],
        [2, 2, 2, 0.4],
      ]),
      activeModalFieldModeCount: 2,
    });
    const featureFrame = createFeatureFrame({ descriptor });
    const originalModeKeys = descriptor.modes.modalField.map(
      (mode) => mode.modeKey,
    );

    const projected = projectStructureFrame(featureFrame, { modeCap: 1 });

    expect(projected.modes.map((mode) => mode.modeKey)).toEqual(["1:1:1"]);
    expect(descriptor.modes.modalField.map((mode) => mode.modeKey)).toEqual(
      originalModeKeys,
    );
    expect(descriptor.modes.modalField).toHaveLength(2);
  });

  it("normalizes mode caps within the documented packet policy", () => {
    expect(normalizeStructureFrameModeCap(undefined)).toBe(
      DEFAULT_STRUCTURE_FRAME_MODE_CAP,
    );
    expect(normalizeStructureFrameModeCap(-1)).toBe(0);
    expect(normalizeStructureFrameModeCap(999)).toBe(
      MAX_STRUCTURE_FRAME_MODE_CAP,
    );
  });
});
