import { AUDIO_SLOT_CAPACITY } from "../defaults.js";
import { foldAudioFrequencyToSpectralPitchPhase } from "../utils/audio/spectralPhase.js";

export const STRUCTURE_EXPORT_SCHEMA_VERSION = 4;
export const DEFAULT_STRUCTURE_EXPORT_MODE_CAP = 32;
export const MAX_STRUCTURE_EXPORT_MODE_CAP = AUDIO_SLOT_CAPACITY;
export const STRUCTURE_EXPORT_MAX_DATAGRAM_BYTES = 1200;
export const STRUCTURE_EXPORT_VECTOR_FLOAT_PAGE_CAPACITY = 208;

const OSC_STRUCTURE_APP_NAME = "Baryon";
const OSC_STRUCTURE_TRANSPORT_KIND = "osc-structure";
const DEFAULT_EFFECTIVE_GEOMETRY = "rectangular";
const DEFAULT_VOLUME_RGB = Object.freeze([0, 0, 0]);
const DEFAULT_SURFACE_RGB = Object.freeze([1, 1, 1]);
const MAX_PUBLIC_STRING_LENGTH = 96;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
const VALID_FIELD_AUTHORITIES = new Set([
  "complete",
  "capacity-limited",
  "bandwidth-limited",
  "blocked",
]);
const VALID_COLOR_MODES = new Set(["static", "spectral"]);

const STRUCTURE_EXPORT_OSC_ADDRESSES = Object.freeze({
  hello: "/baryon/hello",
  topologyBegin: "/baryon/v4/topology/begin",
  topologyMode: "/baryon/v4/topology/mode",
  topologyEnd: "/baryon/v4/topology/end",
  stateContext: "/baryon/v4/state/context",
  stateCoefficients: "/baryon/v4/state/coefficients",
  statePhaseOffsets: "/baryon/v4/state/phase/offsets",
  statePhaseVelocities: "/baryon/v4/state/phase/velocities",
  statePhaseQuality: "/baryon/v4/state/phase/quality",
  stateResponseMetadata: "/baryon/v4/state/response-metadata",
  stateSpectralFirstMoments: "/baryon/v4/state/spectral/first-moments",
  stateSpectralSecondMoments: "/baryon/v4/state/spectral/second-moments",
  stateEnd: "/baryon/v4/state/end",
  clear: "/baryon/v4/clear",
});

export const STRUCTURE_EXPORT_STATE_VECTOR_FIELDS = Object.freeze([
  Object.freeze({
    stateKey: "coefficients",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.stateCoefficients,
    valuesPerMode: 1,
  }),
  Object.freeze({
    stateKey: "phaseOffsets",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.statePhaseOffsets,
    valuesPerMode: 1,
  }),
  Object.freeze({
    stateKey: "phaseVelocities",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.statePhaseVelocities,
    valuesPerMode: 1,
  }),
  Object.freeze({
    stateKey: "phaseQuality",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.statePhaseQuality,
    valuesPerMode: 2,
  }),
  Object.freeze({
    stateKey: "responseMetadata",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.stateResponseMetadata,
    valuesPerMode: 2,
  }),
  Object.freeze({
    stateKey: "spectralFirstMoments",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.stateSpectralFirstMoments,
    valuesPerMode: 2,
  }),
  Object.freeze({
    stateKey: "spectralSecondMoments",
    oscAddress: STRUCTURE_EXPORT_OSC_ADDRESSES.stateSpectralSecondMoments,
    valuesPerMode: 2,
  }),
]);

export const STRUCTURE_EXPORT_STATE_REQUIRED_MASK =
  2 ** (STRUCTURE_EXPORT_STATE_VECTOR_FIELDS.length + 2) - 1;

export const STRUCTURE_EXPORT_OSC_SCHEMA = Object.freeze({
  schemaVersion: STRUCTURE_EXPORT_SCHEMA_VERSION,
  appName: OSC_STRUCTURE_APP_NAME,
  transport: OSC_STRUCTURE_TRANSPORT_KIND,
  maxDatagramBytes: STRUCTURE_EXPORT_MAX_DATAGRAM_BYTES,
  maxModeCount: MAX_STRUCTURE_EXPORT_MODE_CAP,
  vectorFloatPageCapacity: STRUCTURE_EXPORT_VECTOR_FLOAT_PAGE_CAPACITY,
  stateRequiredMask: STRUCTURE_EXPORT_STATE_REQUIRED_MASK,
  addresses: STRUCTURE_EXPORT_OSC_ADDRESSES,
});

function finiteNumber(value, fallback = 0) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function finiteFloat(value, fallback = 0) {
  return Math.fround(finiteNumber(value, fallback));
}

function finiteNonNegativeFloat(value, fallback = 0) {
  return Math.fround(Math.max(0, finiteNumber(value, fallback)));
}

function finiteSafeInteger(value, fallback = 0) {
  const resolved = Math.trunc(finiteNumber(value, fallback));
  if (!Number.isSafeInteger(resolved)) {
    return fallback;
  }
  return Math.max(0, Math.min(MAX_SAFE_REVISION, resolved));
}

function finiteInt32(value, fallback = 0) {
  const resolved = Math.trunc(finiteNumber(value, fallback));
  return Math.max(-2147483648, Math.min(2147483647, resolved));
}

function finiteUint32(value, fallback = 0) {
  const resolved = Math.trunc(finiteNumber(value, fallback));
  if (!Number.isFinite(resolved)) {
    return fallback >>> 0;
  }
  return resolved >>> 0;
}

function resolveOscillatorResponseFrequencyHz({
  phaseAnchorAngularVelocityRadPerSec,
  relativeAngularVelocityRadPerSec,
  phaseAuthority,
}) {
  // Phase slots deliberately carry rotating-frame velocity. Only this
  // observational boundary recombines them with the transported anchor.
  const absoluteAngularVelocityRadPerSec =
    phaseAnchorAngularVelocityRadPerSec + relativeAngularVelocityRadPerSec;
  return phaseAuthority > 0 &&
    Number.isFinite(phaseAnchorAngularVelocityRadPerSec) &&
    Number.isFinite(relativeAngularVelocityRadPerSec) &&
    absoluteAngularVelocityRadPerSec > 0
    ? absoluteAngularVelocityRadPerSec / (2 * Math.PI)
    : 0;
}

function writeOscillatorSpectralMoment({
  frequencyHz,
  index,
  spectralFirstMoments,
  spectralSecondMoments,
}) {
  const angle =
    foldAudioFrequencyToSpectralPitchPhase(frequencyHz) * Math.PI * 2;
  spectralFirstMoments[index * 2] = Math.fround(Math.cos(angle));
  spectralFirstMoments[index * 2 + 1] = Math.fround(Math.sin(angle));
  spectralSecondMoments[index * 2] = Math.fround(Math.cos(angle * 2));
  spectralSecondMoments[index * 2 + 1] = Math.fround(Math.sin(angle * 2));
}

function clamp01Float(value, fallback = 0) {
  return Math.fround(Math.min(1, Math.max(0, finiteNumber(value, fallback))));
}

function boundedString(value, fallback = "") {
  const resolved =
    typeof value === "string" && value.length > 0
      ? value
      : String(fallback ?? "");
  return resolved.slice(0, MAX_PUBLIC_STRING_LENGTH);
}

function identityString(value, fallback = "") {
  return typeof value === "string" && value.length > 0
    ? value
    : String(fallback ?? "");
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

function normalizeRgb(value, fallback) {
  const source = readHexRgb(value) ?? value;
  if (!Array.isArray(source) && !ArrayBuffer.isView(source)) {
    return Object.freeze([...fallback]);
  }
  return Object.freeze([
    clamp01Float(source[0], fallback[0]),
    clamp01Float(source[1], fallback[1]),
    clamp01Float(source[2], fallback[2]),
  ]);
}

export function normalizeStructureExportModeCap(value) {
  return Math.min(
    MAX_STRUCTURE_EXPORT_MODE_CAP,
    Math.max(
      0,
      Math.trunc(finiteNumber(value, DEFAULT_STRUCTURE_EXPORT_MODE_CAP)),
    ),
  );
}

export function normalizeStructureExportAppliedControls(controls = null) {
  const colorMode = VALID_COLOR_MODES.has(controls?.colorMode)
    ? controls.colorMode
    : "static";
  return Object.freeze({
    colorMode,
    volumeColorRgb: normalizeRgb(
      controls?.volumeColorRgb ?? controls?.volumeColor,
      DEFAULT_VOLUME_RGB,
    ),
    surfaceColorRgb: normalizeRgb(
      controls?.surfaceColorRgb ?? controls?.surfaceColor,
      DEFAULT_SURFACE_RGB,
    ),
    effectiveGeometry: boundedString(
      controls?.effectiveGeometry ?? controls?.effectiveCavityGeometry,
      DEFAULT_EFFECTIVE_GEOMETRY,
    ),
  });
}

function projectCoverage(descriptor) {
  const diagnostics = descriptor?.diagnostics ?? null;
  const audit = diagnostics?.modalVarietyAudit ?? null;
  const publishedModeCount = finiteInt32(
    audit?.publishedModeCount ?? descriptor?.counts?.modalFieldModeCount,
    0,
  );
  const descriptorRejectedModeCount = finiteInt32(
    audit?.descriptorRejectedModeCount ?? descriptor?.counts?.overflowModeCount,
    0,
  );
  const modalDescriptorModeCapacity = finiteInt32(
    audit?.modalDescriptorModeCapacity ??
      descriptor?.capacity?.maxTotalModes ??
      publishedModeCount,
    publishedModeCount,
  );
  const publishedModalEnergyRatio = clamp01Float(
    audit?.publishedModalEnergyRatio ?? audit?.renderRepresentedEnergyRatio,
    descriptorRejectedModeCount === 0 && publishedModeCount > 0 ? 1 : 0,
  );
  return Object.freeze({
    descriptorCoverageSatisfied:
      diagnostics?.descriptorCoverageSatisfied === true ||
      diagnostics?.structuralCoverageSatisfied === true,
    publishedModeCount,
    descriptorRejectedModeCount,
    modalDescriptorModeCapacity,
    modalDescriptorCapacityPressure: clamp01Float(
      audit?.modalDescriptorCapacityPressure,
      modalDescriptorModeCapacity > 0
        ? publishedModeCount / modalDescriptorModeCapacity
        : 0,
    ),
    publishedModalEnergyRatio,
    descriptorRejectedEnergyRatio: clamp01Float(
      audit?.descriptorRejectedEnergyRatio,
      publishedModeCount + descriptorRejectedModeCount > 0
        ? 1 - publishedModalEnergyRatio
        : 0,
    ),
    descriptorRejectedModalEnergy: finiteNonNegativeFloat(
      diagnostics?.descriptorRejectedModalEnergy,
      0,
    ),
  });
}

function projectGlobal(featureFrame) {
  const debug = featureFrame?.debug ?? null;
  return Object.freeze({
    rms: finiteNonNegativeFloat(
      featureFrame?.rms ??
        featureFrame?.averageAmplitude ??
        debug?.analyserRms ??
        debug?.avgAmplitude ??
        debug?.rms,
      0,
    ),
    dominantFrequencyHz: finiteNonNegativeFloat(
      featureFrame?.dominantFrequencyHz ??
        featureFrame?.dominantFrequency ??
        debug?.dominantFrequencyHz ??
        debug?.dominantFrequency,
      0,
    ),
    spectralCentroidHz: finiteNonNegativeFloat(
      featureFrame?.spectralCentroidHz ??
        featureFrame?.spectralCentroid ??
        debug?.spectralCentroidHz ??
        debug?.spectralCentroid,
      0,
    ),
    structureSignal: clamp01Float(
      featureFrame?.structureSignal ?? debug?.structureSignal,
      0,
    ),
    energySignal: clamp01Float(
      featureFrame?.energySignal ?? debug?.energySignal,
      0,
    ),
    changeSignal: clamp01Float(
      featureFrame?.changeSignal ?? debug?.changeSignal,
      0,
    ),
    pulseSignal: clamp01Float(
      featureFrame?.pulseSignal ?? debug?.pulseSignal,
      0,
    ),
  });
}

function createCanonicalWriter() {
  const chunks = [];
  const textEncoder = new TextEncoder();

  function fixed(byteLength, write) {
    const buffer = new ArrayBuffer(byteLength);
    write(new DataView(buffer));
    chunks.push(new Uint8Array(buffer));
  }

  return {
    int32(value) {
      fixed(4, (view) => view.setInt32(0, value, false));
    },
    uint32(value) {
      fixed(4, (view) => view.setUint32(0, value, false));
    },
    float32(value) {
      fixed(4, (view) => view.setFloat32(0, value, false));
    },
    float64(value) {
      fixed(8, (view) => view.setFloat64(0, value, false));
    },
    string(value) {
      const bytes = textEncoder.encode(value);
      this.uint32(bytes.byteLength);
      chunks.push(bytes);
    },
    finish() {
      const byteLength = chunks.reduce(
        (total, chunk) => total + chunk.byteLength,
        0,
      );
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
  };
}

function buildTopologyIdentityBytes(topology) {
  const writer = createCanonicalWriter();
  writer.string("baryon-osc-topology-v4");
  writer.float64(topology.sourceGeneration);
  writer.float64(topology.workerGeneration);
  writer.uint32(topology.basisIdentityHash);
  writer.string(topology.observationInputSignature);
  writer.string(topology.effectiveGeometry);
  writer.uint32(topology.modeCap);
  writer.uint32(topology.modeCount);
  for (const mode of topology.modes) {
    writer.int32(mode.u);
    writer.int32(mode.v);
    writer.int32(mode.w);
    writer.float32(mode.naturalFrequencyHz);
    writer.float32(mode.qualityFactor);
  }
  return writer.finish();
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function resolveModeCount(featureFrame, modeCap) {
  const descriptorSlots = featureFrame?.modalDescriptor?.slotViews ?? null;
  const identitySlots =
    featureFrame?.modalIdentitySlots ?? descriptorSlots?.modalIdentitySlots;
  const coefficientSlots =
    featureFrame?.modalCoefficientSlots ??
    descriptorSlots?.modalCoefficientSlots;
  const phaseSlots =
    featureFrame?.modalFieldPhaseSlots ?? descriptorSlots?.modalFieldPhaseSlots;
  const momentSlots =
    featureFrame?.modalFieldSpectralMomentSlots ??
    descriptorSlots?.modalFieldSpectralMomentSlots;
  const metadataSlots =
    featureFrame?.modalFieldMetadataSlots ??
    descriptorSlots?.modalFieldMetadataSlots;
  const declaredCount = finiteInt32(
    featureFrame?.activeModalFieldModeCount ?? featureFrame?.activeModeCount,
    0,
  );
  return Math.max(
    0,
    Math.min(
      modeCap,
      declaredCount,
      Math.floor((identitySlots?.length ?? 0) / 3),
      coefficientSlots?.length ?? 0,
      Math.floor((phaseSlots?.length ?? 0) / 4),
      Math.floor((momentSlots?.length ?? 0) / 4),
      Math.floor((metadataSlots?.length ?? 0) / 4),
    ),
  );
}

function projectNormalizedTopology(featureFrame, appliedControls, modeCap) {
  const slots = featureFrame.modalDescriptor?.slotViews ?? null;
  const identities =
    featureFrame.modalIdentitySlots ?? slots?.modalIdentitySlots;
  const metadata =
    featureFrame.modalFieldMetadataSlots ?? slots?.modalFieldMetadataSlots;
  const modeCount = resolveModeCount(featureFrame, modeCap);
  const modes = [];
  for (let index = 0; index < modeCount; index += 1) {
    const identityOffset = index * 3;
    const offset = index * 4;
    modes.push(
      Object.freeze({
        index,
        u: finiteInt32(identities[identityOffset], 0),
        v: finiteInt32(identities[identityOffset + 1], 0),
        w: finiteInt32(identities[identityOffset + 2], 0),
        naturalFrequencyHz: finiteNonNegativeFloat(metadata[offset], 0),
        qualityFactor: finiteNonNegativeFloat(metadata[offset + 1], 0),
      }),
    );
  }
  return Object.freeze({
    sourceGeneration: finiteSafeInteger(featureFrame.sourceGeneration, 0),
    workerGeneration: finiteSafeInteger(featureFrame.workerGeneration, 0),
    engineTopologyRevision: finiteSafeInteger(featureFrame.topologyRevision, 0),
    basisIdentityHash: finiteUint32(featureFrame.basisIdentityHash, 0),
    observationInputSignature: identityString(
      featureFrame.observationInputSignature,
      "",
    ),
    effectiveGeometry: appliedControls.effectiveGeometry,
    modeCap,
    modeCount,
    modes: Object.freeze(modes),
  });
}

function resolveSourceState(featureFrame) {
  if (featureFrame?.modalDescriptor?.fieldAuthority === "blocked") {
    return "unauthoritative";
  }
  return featureFrame?.modalDescriptor ? "active" : "idle";
}

function projectNormalizedState(sample, appliedControls, modeCount) {
  const featureFrame = sample.featureFrame;
  const slots = featureFrame.modalDescriptor?.slotViews ?? null;
  const coefficients =
    featureFrame.modalCoefficientSlots ?? slots?.modalCoefficientSlots;
  const phases =
    featureFrame.modalFieldPhaseSlots ?? slots?.modalFieldPhaseSlots;
  const metadata =
    featureFrame.modalFieldMetadataSlots ?? slots?.modalFieldMetadataSlots;
  const moments =
    featureFrame.modalFieldSpectralMomentSlots ??
    slots?.modalFieldSpectralMomentSlots;
  const phaseAnchorAngularVelocityRadPerSec = finiteNumber(
    featureFrame.modalPhaseAnchorAngularVelocityRadPerSec,
    Number.NaN,
  );
  // These vectors leave the producer renderer together on every changed OSC
  // sample. Keep one backing store so that the renderer can transfer ownership
  // with a single detachable buffer instead of allocating each vector
  // independently.
  const packedDynamicValues = new Float32Array(modeCount * 11);
  const coefficientValues = packedDynamicValues.subarray(0, modeCount);
  const phaseOffsets = packedDynamicValues.subarray(modeCount, modeCount * 2);
  const phaseVelocities = packedDynamicValues.subarray(
    modeCount * 2,
    modeCount * 3,
  );
  const phaseQuality = packedDynamicValues.subarray(
    modeCount * 3,
    modeCount * 5,
  );
  const responseMetadata = packedDynamicValues.subarray(
    modeCount * 5,
    modeCount * 7,
  );
  const spectralFirstMoments = packedDynamicValues.subarray(
    modeCount * 7,
    modeCount * 9,
  );
  const spectralSecondMoments = packedDynamicValues.subarray(
    modeCount * 9,
    modeCount * 11,
  );
  for (let index = 0; index < modeCount; index += 1) {
    const offset = index * 4;
    coefficientValues[index] = finiteFloat(coefficients[index], 0);
    phaseOffsets[index] = finiteFloat(phases[offset], 0);
    phaseVelocities[index] = finiteFloat(phases[offset + 1], 0);
    phaseQuality[index * 2] = clamp01Float(phases[offset + 2], 0);
    phaseQuality[index * 2 + 1] = clamp01Float(phases[offset + 3], 0);
    const phaseAuthority = phaseQuality[index * 2 + 1];
    const relativeAngularVelocityRadPerSec = finiteNumber(
      phases[offset + 1],
      Number.NaN,
    );
    const oscillatorResponseFrequencyHz = resolveOscillatorResponseFrequencyHz({
      phaseAnchorAngularVelocityRadPerSec,
      relativeAngularVelocityRadPerSec,
      phaseAuthority,
    });
    responseMetadata[index * 2] = finiteNonNegativeFloat(
      oscillatorResponseFrequencyHz || metadata[offset + 2],
      0,
    );
    responseMetadata[index * 2 + 1] = clamp01Float(metadata[offset + 3], 0);
    if (oscillatorResponseFrequencyHz > 0) {
      writeOscillatorSpectralMoment({
        frequencyHz: oscillatorResponseFrequencyHz,
        index,
        spectralFirstMoments,
        spectralSecondMoments,
      });
    } else {
      spectralFirstMoments[index * 2] = finiteFloat(moments[offset], 0);
      spectralFirstMoments[index * 2 + 1] = finiteFloat(
        moments[offset + 1],
        0,
      );
      spectralSecondMoments[index * 2] = finiteFloat(moments[offset + 2], 0);
      spectralSecondMoments[index * 2 + 1] = finiteFloat(
        moments[offset + 3],
        0,
      );
    }
  }
  const descriptor = featureFrame.modalDescriptor;
  return Object.freeze({
    frameId: finiteSafeInteger(featureFrame.frameId, 0),
    appliedControlRevision: finiteSafeInteger(sample.appliedControlRevision, 0),
    modeCount,
    phaseReferenceTimeSeconds: Math.max(
      0,
      finiteNumber(
        featureFrame.observationTimeSeconds,
        finiteNumber(featureFrame.frameTimeMs, 0) / 1000,
      ),
    ),
    observationAdvancing: featureFrame.observationAdvancing === true,
    sourceState: resolveSourceState(featureFrame),
    fieldAuthority: VALID_FIELD_AUTHORITIES.has(descriptor?.fieldAuthority)
      ? descriptor.fieldAuthority
      : "complete",
    coverage: projectCoverage(descriptor),
    global: projectGlobal(featureFrame),
    material: appliedControls,
    coefficients: coefficientValues,
    phaseOffsets,
    phaseVelocities,
    phaseQuality,
    responseMetadata,
    spectralFirstMoments,
    spectralSecondMoments,
  });
}

export function createStructureExportSampleIdentity(sample) {
  const featureFrame = sample?.featureFrame;
  if (!featureFrame) {
    return null;
  }
  return Object.freeze({
    producerSessionId: boundedString(sample.producerSessionId, ""),
    sourceGeneration: finiteSafeInteger(featureFrame.sourceGeneration, 0),
    workerGeneration: finiteSafeInteger(featureFrame.workerGeneration, 0),
    topologyRevision: finiteSafeInteger(featureFrame.topologyRevision, 0),
    frameId: finiteSafeInteger(featureFrame.frameId, 0),
    observationAdvancing: featureFrame.observationAdvancing === true,
    resolvedSemanticRevision: finiteSafeInteger(
      sample.resolvedSemanticRevision,
      0,
    ),
    appliedControlRevision: finiteSafeInteger(sample.appliedControlRevision, 0),
  });
}

export function areStructureExportSampleIdentitiesEqual(left, right) {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.producerSessionId === right.producerSessionId &&
    left.sourceGeneration === right.sourceGeneration &&
    left.workerGeneration === right.workerGeneration &&
    left.topologyRevision === right.topologyRevision &&
    left.frameId === right.frameId &&
    left.observationAdvancing === right.observationAdvancing &&
    left.resolvedSemanticRevision === right.resolvedSemanticRevision &&
    left.appliedControlRevision === right.appliedControlRevision
  );
}

function matchesCachedTopology(
  topology,
  featureFrame,
  appliedControls,
  modeCap,
) {
  // The engine topology revision also advances when observation-derived
  // response/support/moment values change. OSC topology is narrower: only
  // structural mode identity, natural frequency, and Q can invalidate it.
  if (!topology) {
    return false;
  }
  const modeCount = resolveModeCount(featureFrame, modeCap);
  if (
    topology.sourceGeneration !==
      finiteSafeInteger(featureFrame?.sourceGeneration, 0) ||
    topology.workerGeneration !==
      finiteSafeInteger(featureFrame?.workerGeneration, 0) ||
    topology.basisIdentityHash !==
      finiteUint32(featureFrame?.basisIdentityHash, 0) ||
    topology.observationInputSignature !==
      identityString(featureFrame?.observationInputSignature, "") ||
    topology.effectiveGeometry !== appliedControls.effectiveGeometry ||
    topology.modeCap !== modeCap ||
    topology.modeCount !== modeCount
  ) {
    return false;
  }
  const slots = featureFrame?.modalDescriptor?.slotViews ?? null;
  const identities =
    featureFrame?.modalIdentitySlots ?? slots?.modalIdentitySlots;
  const metadata =
    featureFrame?.modalFieldMetadataSlots ?? slots?.modalFieldMetadataSlots;
  for (let index = 0; index < modeCount; index += 1) {
    const mode = topology.modes[index];
    const identityOffset = index * 3;
    const offset = index * 4;
    if (
      mode.u !== finiteInt32(identities[identityOffset], 0) ||
      mode.v !== finiteInt32(identities[identityOffset + 1], 0) ||
      mode.w !== finiteInt32(identities[identityOffset + 2], 0) ||
      mode.naturalFrequencyHz !== finiteNonNegativeFloat(metadata[offset], 0) ||
      mode.qualityFactor !== finiteNonNegativeFloat(metadata[offset + 1], 0)
    ) {
      return false;
    }
  }
  return true;
}

export function createStructureExportProjector() {
  let topologyCache = null;
  return {
    async project(
      sample,
      {
        modeCap = DEFAULT_STRUCTURE_EXPORT_MODE_CAP,
        knownTopologyKey = null,
      } = {},
    ) {
      if (!sample?.featureFrame) {
        return null;
      }
      const normalizedModeCap = normalizeStructureExportModeCap(modeCap);
      const appliedControls = normalizeStructureExportAppliedControls(
        sample.appliedControls,
      );
      if (
        !matchesCachedTopology(
          topologyCache?.topology,
          sample.featureFrame,
          appliedControls,
          normalizedModeCap,
        )
      ) {
        const topology = projectNormalizedTopology(
          sample.featureFrame,
          appliedControls,
          normalizedModeCap,
        );
        const identityBytes = buildTopologyIdentityBytes(topology);
        topologyCache = {
          topology,
          topologyKey: await sha256Hex(identityBytes),
        };
      }
      const sampleIdentity = createStructureExportSampleIdentity(sample);
      return Object.freeze({
        sampleIdentity,
        topologyKey: topologyCache.topologyKey,
        topology:
          knownTopologyKey === topologyCache.topologyKey
            ? null
            : topologyCache.topology,
        state: projectNormalizedState(
          sample,
          appliedControls,
          topologyCache.topology.modeCount,
        ),
      });
    },
  };
}
