export const STRUCTURE_FRAME_SCHEMA_VERSION = 1;
export const DEFAULT_STRUCTURE_FRAME_MODE_CAP = 32;
export const MAX_STRUCTURE_FRAME_MODE_CAP = 64;

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
