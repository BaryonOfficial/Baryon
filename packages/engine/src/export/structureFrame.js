export const STRUCTURE_FRAME_SCHEMA_VERSION = 1;
export const DEFAULT_STRUCTURE_FRAME_MODE_CAP = 32;
export const MAX_STRUCTURE_FRAME_MODE_CAP = 64;

const OSC_STRUCTURE_APP_NAME = "Baryon";
const OSC_STRUCTURE_TRANSPORT_KIND = "osc-structure";
const DEFAULT_EFFECTIVE_CAVITY_GEOMETRY = "rectangular";
const DEFAULT_MATERIAL_COLOR_RGB = Object.freeze([0, 0, 0]);
const VALID_FIELD_AUTHORITIES = new Set([
  "complete",
  "capacity-limited",
  "bandwidth-limited",
  "blocked",
]);
const VALID_SOURCE_STATES = new Set(["active", "idle", "unauthoritative"]);
const VALID_COLOR_MODES = new Set(["static", "spectral"]);
const MAX_PUBLIC_STRING_LENGTH = 96;

function deepFreezeContract(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreezeContract(child);
  }
  return value;
}

export const STRUCTURE_FRAME_OSC_SCHEMA = deepFreezeContract({
  schemaVersion: STRUCTURE_FRAME_SCHEMA_VERSION,
  appName: OSC_STRUCTURE_APP_NAME,
  transport: OSC_STRUCTURE_TRANSPORT_KIND,
  tables: {
    keyValueColumns: ["key", "value"],
    rawColumns: ["address", "args"],
    modes: {
      columns: [
        "index",
        "key",
        "u",
        "v",
        "w",
        "coefficient",
        "energy",
        "phaseOffsetRad",
        "phaseVelocityRadPerSec",
        "phaseCoherence",
        "phaseAuthority",
        "frequencyHz",
        "q",
        "damping",
        "support",
        "r",
        "g",
        "b",
        "colorWeight",
      ],
    },
    colors: {
      columns: [
        "index",
        "key",
        "frequencyHz",
        "energy",
        "r",
        "g",
        "b",
        "colorWeight",
      ],
    },
  },
  packets: {
    hello: {
      address: "/baryon/hello",
      args: [
        { name: "appName", type: "s", value: OSC_STRUCTURE_APP_NAME },
        {
          name: "schemaVersion",
          type: "i",
          value: STRUCTURE_FRAME_SCHEMA_VERSION,
        },
        { name: "transport", type: "s", value: OSC_STRUCTURE_TRANSPORT_KIND },
      ],
    },
    clear: {
      address: "/baryon/frame/clear",
      args: [{ name: "sequence", type: "i" }],
    },
    frame: [
      {
        address: "/baryon/schema/version",
        target: "frame",
        storeKey: "schemaVersion",
        args: [{ name: "schemaVersion", type: "i", path: ["schemaVersion"] }],
      },
      {
        address: "/baryon/frame/begin",
        target: "frame",
        resetModes: true,
        resetRaw: true,
        args: [
          {
            name: "sequence",
            type: "i",
            path: ["frameSequence"],
            parameter: "Frame",
          },
          { name: "frameTimeMs", type: "f", path: ["frameTimeMs"] },
          { name: "sourceState", type: "s", path: ["sourceState"] },
          {
            name: "geometry",
            type: "s",
            path: ["effectiveCavityGeometry"],
          },
        ],
      },
      {
        address: "/baryon/frame/modeCount",
        target: "frame",
        storeKey: "modeCount",
        parameter: "Modecount",
        args: [{ name: "modeCount", type: "i", path: ["modeCount"] }],
      },
      {
        address: "/baryon/descriptor/authority",
        target: "frame",
        storeKey: "authority",
        args: [{ name: "authority", type: "s", path: ["fieldAuthority"] }],
      },
      {
        address: "/baryon/coverage/satisfied",
        target: "coverage",
        storeKey: "satisfied",
        args: [
          {
            name: "structuralCoverageSatisfied",
            type: "i",
            path: ["coverage", "structuralCoverageSatisfied"],
          },
        ],
      },
      {
        address: "/baryon/coverage/modeCounts",
        target: "coverage",
        storeKey: "modeCounts",
        args: [
          {
            name: "semanticModeCount",
            type: "i",
            path: ["coverage", "semanticModeCount"],
          },
          {
            name: "representedBasisPageModeCount",
            type: "i",
            path: ["coverage", "representedBasisPageModeCount"],
          },
        ],
      },
      {
        address: "/baryon/coverage/energyRatio",
        target: "coverage",
        storeKey: "energyRatio",
        args: [
          {
            name: "renderRepresentedEnergyRatio",
            type: "f",
            path: ["coverage", "renderRepresentedEnergyRatio"],
          },
        ],
      },
      {
        address: "/baryon/coverage/rejectedEnergy",
        target: "coverage",
        storeKey: "rejectedEnergy",
        args: [
          {
            name: "rejectedModalEnergy",
            type: "f",
            path: ["coverage", "rejectedModalEnergy"],
          },
        ],
      },
      {
        address: "/baryon/coverage/rejectedCounts",
        target: "coverage",
        storeKey: "rejectedCounts",
        args: [
          {
            name: "basisAtlasCapacityRejectedCount",
            type: "i",
            path: ["coverage", "basisAtlasCapacityRejectedCount"],
          },
          {
            name: "spatialBandwidthRejectedCount",
            type: "i",
            path: ["coverage", "spatialBandwidthRejectedCount"],
          },
          {
            name: "overBandwidthRejectedModeCount",
            type: "i",
            path: ["coverage", "overBandwidthRejectedModeCount"],
          },
        ],
      },
      {
        address: "/baryon/coverage/overBandwidth",
        target: "coverage",
        storeKey: "overBandwidth",
        args: [
          {
            name: "overBandwidthDominant",
            type: "i",
            path: ["coverage", "overBandwidthDominant"],
          },
        ],
      },
      {
        address: "/baryon/global/rms",
        target: "global",
        storeKey: "rms",
        parameter: "Rms",
        args: [{ name: "rms", type: "f", path: ["global", "rms"] }],
      },
      {
        address: "/baryon/global/dominantHz",
        target: "global",
        storeKey: "dominantHz",
        args: [
          {
            name: "dominantFrequencyHz",
            type: "f",
            path: ["global", "dominantFrequencyHz"],
          },
        ],
      },
      {
        address: "/baryon/global/centroidHz",
        target: "global",
        storeKey: "centroidHz",
        args: [
          {
            name: "spectralCentroidHz",
            type: "f",
            path: ["global", "spectralCentroidHz"],
          },
        ],
      },
      {
        address: "/baryon/global/structure",
        target: "global",
        storeKey: "structure",
        args: [
          {
            name: "structureSignal",
            type: "f",
            path: ["global", "structureSignal"],
          },
        ],
      },
      {
        address: "/baryon/global/energy",
        target: "global",
        storeKey: "energy",
        args: [
          { name: "energySignal", type: "f", path: ["global", "energySignal"] },
        ],
      },
      {
        address: "/baryon/global/change",
        target: "global",
        storeKey: "change",
        args: [
          { name: "changeSignal", type: "f", path: ["global", "changeSignal"] },
        ],
      },
      {
        address: "/baryon/global/pulse",
        target: "global",
        storeKey: "pulse",
        args: [
          { name: "pulseSignal", type: "f", path: ["global", "pulseSignal"] },
        ],
      },
      {
        address: "/baryon/color/mode",
        target: "material",
        storeKey: "colorMode",
        args: [
          { name: "colorMode", type: "s", path: ["material", "colorMode"] },
        ],
      },
      {
        address: "/baryon/global/material/volumeColor",
        target: "material",
        storeKey: "volumeColor",
        args: [
          { name: "r", type: "f", path: ["material", "volumeColorRgb", 0] },
          { name: "g", type: "f", path: ["material", "volumeColorRgb", 1] },
          { name: "b", type: "f", path: ["material", "volumeColorRgb", 2] },
        ],
      },
      {
        address: "/baryon/global/material/surfaceColor",
        target: "material",
        storeKey: "surfaceColor",
        args: [
          { name: "r", type: "f", path: ["material", "surfaceColorRgb", 0] },
          { name: "g", type: "f", path: ["material", "surfaceColorRgb", 1] },
          { name: "b", type: "f", path: ["material", "surfaceColorRgb", 2] },
        ],
      },
    ],
    modes: [
      {
        suffix: "key",
        args: [{ column: "key", type: "s", path: ["modeKey"] }],
      },
      {
        suffix: "uvw",
        args: [
          { column: "u", type: "i", path: ["u"] },
          { column: "v", type: "i", path: ["v"] },
          { column: "w", type: "i", path: ["w"] },
        ],
      },
      {
        suffix: "coefficient",
        args: [{ column: "coefficient", type: "f", path: ["coefficient"] }],
      },
      {
        suffix: "energy",
        args: [{ column: "energy", type: "f", path: ["coefficientEnergy"] }],
      },
      {
        suffix: "phase",
        args: [
          { column: "phaseOffsetRad", type: "f", path: ["phaseOffsetRad"] },
          {
            column: "phaseVelocityRadPerSec",
            type: "f",
            path: ["phaseVelocityRadPerSec"],
          },
          { column: "phaseCoherence", type: "f", path: ["phaseCoherence"] },
          { column: "phaseAuthority", type: "f", path: ["phaseAuthority"] },
        ],
      },
      {
        suffix: "frequencyHz",
        args: [
          {
            column: "frequencyHz",
            type: "f",
            path: ["naturalFrequencyHz"],
          },
        ],
      },
      {
        suffix: "q",
        args: [{ column: "q", type: "f", path: ["qualityFactor"] }],
      },
      {
        suffix: "damping",
        args: [{ column: "damping", type: "f", path: ["dampingRatio"] }],
      },
      {
        suffix: "support",
        args: [{ column: "support", type: "f", path: ["observedSupport"] }],
      },
      {
        suffix: "material/color",
        args: [
          { column: "r", type: "f", path: ["material", "colorRgb", 0] },
          { column: "g", type: "f", path: ["material", "colorRgb", 1] },
          { column: "b", type: "f", path: ["material", "colorRgb", 2] },
          {
            column: "colorWeight",
            type: "f",
            path: ["material", "colorWeight"],
          },
        ],
      },
    ],
    end: {
      address: "/baryon/frame/end",
      args: [{ name: "sequence", type: "i", path: ["frameSequence"] }],
    },
  },
});

function finiteNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function finiteNonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function finiteInteger(value, fallback = 0) {
  return Math.trunc(finiteNumber(value, fallback));
}

function finiteNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, finiteInteger(value, fallback));
}

function clamp01(value, fallback = 0) {
  return Math.min(1, Math.max(0, finiteNumber(value, fallback)));
}

function boundedString(value, fallback = "") {
  const text =
    typeof value === "string" && value.length > 0 ? value : String(value ?? "");
  const resolvedText = text.length > 0 ? text : String(fallback ?? "");
  return resolvedText.slice(0, MAX_PUBLIC_STRING_LENGTH);
}

function boundedEnum(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback;
}

function readRgbArray(value, fallback = DEFAULT_MATERIAL_COLOR_RGB) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    return [...fallback];
  }

  return [
    clamp01(value[0], fallback[0] ?? 0),
    clamp01(value[1], fallback[1] ?? 0),
    clamp01(value[2], fallback[2] ?? 0),
  ];
}

function readHexRgb(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

function readControlRgb(value, fallback = DEFAULT_MATERIAL_COLOR_RGB) {
  return readHexRgb(value) ?? readRgbArray(value, fallback);
}

export function normalizeStructureFrameModeCap(value) {
  const cap = finiteNonNegativeInteger(value, DEFAULT_STRUCTURE_FRAME_MODE_CAP);
  return Math.min(MAX_STRUCTURE_FRAME_MODE_CAP, Math.max(0, cap));
}

function resolveFrameSequence(featureFrame, options) {
  return finiteNonNegativeInteger(
    options.frameSequence ?? featureFrame?.frameSequence,
    0,
  );
}

function resolveFrameTimeMs(featureFrame, options) {
  return finiteNonNegative(
    featureFrame?.frameTimeMs ??
      featureFrame?.timeMs ??
      featureFrame?.time ??
      options.frameTimeMs,
    0,
  );
}

function resolveSourceState(featureFrame, descriptor, options) {
  if (VALID_SOURCE_STATES.has(options.sourceState)) {
    return options.sourceState;
  }
  if (!featureFrame) {
    return "idle";
  }
  if (descriptor?.fieldAuthority === "blocked") {
    return "unauthoritative";
  }
  if (!descriptor) {
    return "idle";
  }
  return "active";
}

function resolveGeometry(featureFrame, options) {
  const requestedCavityGeometry =
    featureFrame?.requestedCavityGeometry ??
    featureFrame?.debug?.requestedCavityGeometry ??
    options.requestedCavityGeometry ??
    null;
  const effectiveCavityGeometry =
    featureFrame?.effectiveCavityGeometry ??
    featureFrame?.debug?.effectiveCavityGeometry ??
    options.effectiveCavityGeometry ??
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY;

  return {
    requestedCavityGeometry:
      requestedCavityGeometry == null
        ? null
        : boundedString(requestedCavityGeometry, null),
    effectiveCavityGeometry: boundedString(
      effectiveCavityGeometry,
      DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
    ),
  };
}

function projectCoverageSummary(descriptor) {
  const diagnostics = descriptor?.diagnostics ?? null;
  const audit = diagnostics?.modalVarietyAudit ?? null;
  const semanticModeCount =
    audit?.semanticModeCount ??
    descriptor?.counts?.validModeCount ??
    descriptor?.modes?.modalField?.length ??
    0;
  const representedBasisPageModeCount =
    audit?.representedBasisPageModeCount ??
    descriptor?.counts?.modalFieldModeCount ??
    descriptor?.modes?.modalField?.length ??
    0;
  const basisAtlasCapacityRejectedCount =
    diagnostics?.basisAtlasCapacityRejectedCount ??
    audit?.basisAtlasCapacityRejectedCount ??
    0;
  const spatialBandwidthRejectedCount =
    diagnostics?.spatialBandwidthRejectedCount ??
    audit?.spatialBandwidthRejectedCount ??
    0;
  const overBandwidthRejectedModeCount =
    diagnostics?.overBandwidthRejectedModeCount ??
    audit?.overBandwidthRejectedModeCount ??
    0;

  return {
    structuralCoverageSatisfied:
      diagnostics?.structuralCoverageSatisfied === true,
    semanticModeCount: finiteNonNegativeInteger(semanticModeCount),
    representedBasisPageModeCount: finiteNonNegativeInteger(
      representedBasisPageModeCount,
    ),
    renderRepresentedEnergyRatio: clamp01(
      audit?.renderRepresentedEnergyRatio,
      0,
    ),
    rejectedModalEnergy: finiteNonNegative(diagnostics?.rejectedModalEnergy, 0),
    basisAtlasCapacityRejectedCount: finiteNonNegativeInteger(
      basisAtlasCapacityRejectedCount,
    ),
    spatialBandwidthRejectedCount: finiteNonNegativeInteger(
      spatialBandwidthRejectedCount,
    ),
    overBandwidthRejectedModeCount: finiteNonNegativeInteger(
      overBandwidthRejectedModeCount,
    ),
    overBandwidthDominant:
      diagnostics?.overBandwidthDominant === true ||
      audit?.overBandwidthDominant === true,
  };
}

function projectGlobalSignals(featureFrame) {
  const debug = featureFrame?.debug ?? null;
  return {
    rms: finiteNonNegative(
      featureFrame?.rms ??
        featureFrame?.averageAmplitude ??
        debug?.analyserRms ??
        debug?.avgAmplitude ??
        debug?.rms,
      0,
    ),
    dominantFrequencyHz: finiteNonNegative(
      featureFrame?.dominantFrequency ??
        featureFrame?.dominantFrequencyHz ??
        debug?.dominantFrequency ??
        debug?.dominantFrequencyHz,
      0,
    ),
    spectralCentroidHz: finiteNonNegative(
      featureFrame?.spectralCentroid ??
        featureFrame?.spectralCentroidHz ??
        debug?.spectralCentroid ??
        debug?.spectralCentroidHz,
      0,
    ),
    structureSignal: clamp01(
      featureFrame?.structureSignal ?? debug?.structureSignal,
      0,
    ),
    energySignal: clamp01(featureFrame?.energySignal ?? debug?.energySignal, 0),
    changeSignal: clamp01(featureFrame?.changeSignal ?? debug?.changeSignal, 0),
    pulseSignal: clamp01(featureFrame?.pulseSignal ?? debug?.pulseSignal, 0),
  };
}

function projectMaterialContext(options = {}) {
  const controls = options.controls ?? null;
  const colorMode = boundedEnum(
    options.colorMode ?? controls?.colorMode,
    VALID_COLOR_MODES,
    "static",
  );

  return {
    colorMode,
    volumeColorRgb: readControlRgb(controls?.volumeColor),
    surfaceColorRgb: readControlRgb(controls?.surfaceColor, [1, 1, 1]),
  };
}

function projectMode(mode, index) {
  const coefficient = finiteNumber(mode?.coefficient, 0);
  const material = mode?.material ?? null;
  return {
    index,
    modeKey: boundedString(
      mode?.modeKey,
      `${mode?.u ?? 0}:${mode?.v ?? 0}:${mode?.w ?? 0}`,
    ),
    u: finiteInteger(mode?.u, 0),
    v: finiteInteger(mode?.v, 0),
    w: finiteInteger(mode?.w, 0),
    coefficient,
    coefficientEnergy: coefficient ** 2,
    referenceAmplitude: finiteNumber(mode?.referenceAmplitude, coefficient),
    phaseOffsetRad: finiteNumber(mode?.phaseOffsetRad, 0),
    phaseVelocityRadPerSec: finiteNumber(mode?.phaseVelocityRadPerSec, 0),
    phaseCoherence: clamp01(mode?.phaseCoherence, 0),
    phaseAuthority: clamp01(mode?.phaseAuthority, 0),
    naturalFrequencyHz: finiteNonNegative(mode?.naturalFrequencyHz, 0),
    qualityFactor: finiteNonNegative(mode?.qualityFactor, 0),
    dampingRatio: finiteNonNegative(mode?.dampingRatio, 0),
    observedSupport: clamp01(mode?.observedSupport, 0),
    material: {
      colorRgb: readRgbArray(material?.colorRgb),
      colorWeight: clamp01(material?.colorWeight, 0),
    },
  };
}

export function projectStructureFrame(featureFrame, options = {}) {
  if (!featureFrame) {
    return null;
  }

  const descriptor = featureFrame.modalDescriptor ?? null;
  const modeCap = normalizeStructureFrameModeCap(options.modeCap);
  const descriptorModes = Array.isArray(descriptor?.modes?.modalField)
    ? descriptor.modes.modalField
    : [];
  const modes = descriptorModes.slice(0, modeCap).map(projectMode);
  const geometry = resolveGeometry(featureFrame, options);

  return {
    schemaVersion: STRUCTURE_FRAME_SCHEMA_VERSION,
    frameSequence: resolveFrameSequence(featureFrame, options),
    frameTimeMs: resolveFrameTimeMs(featureFrame, options),
    sourceState: resolveSourceState(featureFrame, descriptor, options),
    fieldAuthority: boundedEnum(
      descriptor?.fieldAuthority,
      VALID_FIELD_AUTHORITIES,
      "complete",
    ),
    ...geometry,
    coverage: projectCoverageSummary(descriptor),
    global: projectGlobalSignals(featureFrame),
    material: projectMaterialContext(options),
    modeCount: modes.length,
    modes,
  };
}
