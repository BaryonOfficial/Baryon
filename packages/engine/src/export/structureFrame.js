import { hasRenderAuthority } from "../core/renderAuthorityContract.js";
import {
  isAudioFeatureTopologyPacket,
  isAudioFeatureObservationPacket,
} from "../contracts/audioFeatureProtocol.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../core/raymarch/fieldObservation.js";

export const STRUCTURE_EXPORT_SCHEMA_VERSION = 5;
export const STRUCTURE_EXPORT_MAX_DATAGRAM_BYTES = 1200;
export const STRUCTURE_EXPORT_PAGE_BYTES = 960;
export const STRUCTURE_EXPORT_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAGIC = 0x42594e35,
  MAX_METADATA_BYTES = 16384;
const REVISIONS = [
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
  "topologyRevision",
];
const TOPOLOGY_ARRAYS = [
  ["familyIndices", "u16"],
  ["familyShells", "u16"],
  ["sourceOverlaps", "f64"],
  ["naturalFrequenciesHz", "f64"],
  ["qualityFactors", "f64"],
  ["transitions", "f64"],
];
const STATE_ARRAYS = [
  ["pressure", "f64"],
  ["velocity", "f64"],
  ["pressureMoments", "f64"],
  ["velocityMoments", "f64"],
  ["inputSpectrum", "f64"],
  ["boundaryDelta", "f64"],
];
export const STRUCTURE_EXPORT_OSC_SCHEMA = Object.freeze({
  schemaVersion: 5,
  appName: "Baryon",
  transport: "osc-structure",
  maxDatagramBytes: STRUCTURE_EXPORT_MAX_DATAGRAM_BYTES,
  pageBytes: STRUCTURE_EXPORT_PAGE_BYTES,
  maxPayloadBytes: STRUCTURE_EXPORT_MAX_PAYLOAD_BYTES,
  payloadEncoding: "baryon-full-model-le-v1",
  integrity: "sha256",
  addresses: Object.freeze({
    hello: "/baryon/hello",
    topologyBegin: "/baryon/v5/topology/begin",
    topologyChunk: "/baryon/v5/topology/chunk",
    topologyEnd: "/baryon/v5/topology/end",
    stateBegin: "/baryon/v5/state/begin",
    stateChunk: "/baryon/v5/state/chunk",
    stateEnd: "/baryon/v5/state/end",
    clear: "/baryon/v5/clear",
  }),
});

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function integer(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function rgb(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return [...fallback];
  return [0, 1, 2].map((i) =>
    Number.isFinite(value[i])
      ? Math.min(1, Math.max(0, value[i]))
      : fallback[i],
  );
}
function material(controls) {
  return {
    colorMode: controls?.colorMode === "spectral" ? "spectral" : "static",
    colorSpace: "srgb",
    volumeColorRgb: rgb(controls?.volumeColorRgb, [0, 0, 0]),
    surfaceColorRgb: rgb(controls?.surfaceColorRgb, [1, 1, 1]),
    spectralChroma: Number.isFinite(controls?.spectralChroma)
      ? Math.min(1, Math.max(0, controls.spectralChroma))
      : 1,
  };
}
function validMaterial(value) {
  return (
    object(value) &&
    ["static", "spectral"].includes(value.colorMode) &&
    value.colorSpace === "srgb" &&
    [value.volumeColorRgb, value.surfaceColorRgb].every(
      (v) =>
        Array.isArray(v) &&
        v.length === 3 &&
        v.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
    ) &&
    Number.isFinite(value.spectralChroma) &&
    value.spectralChroma >= 0 &&
    value.spectralChroma <= 1
  );
}
function validConvention(value) {
  return (
    object(value) &&
    value.representation === "full-shell-quadratic-gorkov-v1" &&
    value.coordinateHalfExtent === 1 &&
    Number.isFinite(value.pressureEnergyWeight) &&
    value.pressureEnergyWeight >= 0 &&
    Number.isFinite(value.velocityEnergyWeight) &&
    value.velocityEnergyWeight >= 0 &&
    value.pressureEnergyWeight + value.velocityEnergyWeight > 0
  );
}
function validValue(value) {
  if (value?.kind === "topology")
    return (
      isAudioFeatureTopologyPacket(value.topology) &&
      validConvention(value.fieldConvention)
    );
  return (
    value?.kind === "state" &&
    isAudioFeatureObservationPacket(value.observation) &&
    validMaterial(value.material)
  );
}
function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function parts(value) {
  if (!validValue(value))
    throw new TypeError("Invalid full-model structure export payload");
  if (value.kind === "topology") {
    const t = value.topology;
    return {
      spec: TOPOLOGY_ARRAYS,
      arrays: [
        t.familyIndices,
        t.familyShells,
        t.sourceOverlaps,
        t.naturalFrequenciesHz,
        t.qualityFactors,
        t.spectrum.transitions,
      ],
      metadata: {
        topology: {
          ...pick(t, [
            "protocolVersion",
            ...REVISIONS,
            "basisConvention",
            "boundaryMode",
            "sampleRate",
            "channelCount",
            "exposureSeconds",
            "familyCount",
            "shellCount",
          ]),
          spectrum: pick(t.spectrum, [
            "representation",
            "frameSize",
            "hopSize",
          ]),
        },
        fieldConvention: pick(value.fieldConvention, [
          "representation",
          "coordinateHalfExtent",
          "pressureEnergyWeight",
          "velocityEnergyWeight",
        ]),
      },
    };
  }
  const o = value.observation;
  return {
    spec: STATE_ARRAYS,
    arrays: [
      o.pressure,
      o.velocity,
      o.pressureMoments,
      o.velocityMoments,
      o.spectrum.inputSpectrum,
      o.spectrum.boundaryDelta,
    ],
    metadata: {
      observation: {
        ...pick(o, [
          "protocolVersion",
          ...REVISIONS,
          "frameId",
          "startSample",
          "endSample",
          "inputEndSample",
          "preparationDelayFrames",
          "sourcePhase",
          "normalizationEnergy",
        ]),
        spectrum: pick(o.spectrum, ["frameEndSample"]),
      },
      material: material(value.material),
    },
  };
}

/** Lossless, explicitly little-endian transport copy. Never aliases acoustic state. */
export function encodeStructureExportPayload(value) {
  const { spec, arrays, metadata } = parts(value);
  const header = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 5,
      kind: value.kind,
      metadata,
      arrays: spec.map(([name, type], i) => ({
        name,
        type,
        length: arrays[i].length,
      })),
    }),
  );
  const byteLength =
    8 + header.byteLength + arrays.reduce((sum, a) => sum + a.byteLength, 0);
  if (
    header.byteLength > MAX_METADATA_BYTES ||
    byteLength > STRUCTURE_EXPORT_MAX_PAYLOAD_BYTES
  )
    throw new RangeError(
      "Structure export payload exceeds the declared transport bound; no basis is truncated",
    );
  const bytes = new Uint8Array(byteLength),
    view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, false);
  view.setUint32(4, header.byteLength, true);
  bytes.set(header, 8);
  let offset = 8 + header.byteLength;
  arrays.forEach((array, i) => {
    const word = spec[i][1] === "u16" ? 2 : 8;
    for (const number of array) {
      if (word === 2) view.setUint16(offset, number, true);
      else view.setFloat64(offset, number, true);
      offset += word;
    }
  });
  return bytes;
}

/** Decode only the declared schema; bounded dimensions precede all allocations. */
export function decodeStructureExportPayload(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 8 ||
    bytes.byteLength > STRUCTURE_EXPORT_MAX_PAYLOAD_BYTES
  )
    throw new TypeError("Invalid structure payload length");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    headerLength = view.getUint32(4, true);
  if (
    view.getUint32(0, false) !== MAGIC ||
    headerLength > MAX_METADATA_BYTES ||
    headerLength > bytes.byteLength - 8
  )
    throw new TypeError("Invalid structure payload header");
  const header = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(8, 8 + headerLength),
    ),
  );
  const spec =
    header.kind === "topology"
      ? TOPOLOGY_ARRAYS
      : header.kind === "state"
        ? STATE_ARRAYS
        : null;
  if (
    header.schemaVersion !== 5 ||
    !spec ||
    !object(header.metadata) ||
    !Array.isArray(header.arrays) ||
    header.arrays.length !== spec.length
  )
    throw new TypeError("Unsupported structure payload schema");
  let offset = 8 + headerLength;
  const arrays = {};
  // Validate the entire binary layout before allocating any typed array.
  for (let i = 0; i < spec.length; i++) {
    const descriptor = header.arrays[i],
      word = spec[i][1] === "u16" ? 2 : 8;
    if (
      !object(descriptor) ||
      descriptor.name !== spec[i][0] ||
      descriptor.type !== spec[i][1] ||
      !integer(descriptor.length) ||
      descriptor.length > (bytes.byteLength - offset) / word
    )
      throw new TypeError("Invalid structure array descriptor");
    offset += descriptor.length * word;
  }
  if (offset !== bytes.byteLength)
    throw new TypeError("Truncated or trailing structure data");
  offset = 8 + headerLength;
  for (let i = 0; i < spec.length; i++) {
    const descriptor = header.arrays[i],
      word = spec[i][1] === "u16" ? 2 : 8,
      array =
        word === 2
          ? new Uint16Array(descriptor.length)
          : new Float64Array(descriptor.length);
    for (let j = 0; j < array.length; j++) {
      array[j] =
        word === 2
          ? view.getUint16(offset, true)
          : view.getFloat64(offset, true);
      offset += word;
    }
    arrays[spec[i][0]] = array;
  }
  const metadata = header.metadata;
  let value;
  if (header.kind === "topology") {
    const { transitions, ...familyArrays } = arrays;
    value = {
      kind: "topology",
      topology: {
        ...metadata.topology,
        ...familyArrays,
        spectrum: { ...metadata.topology?.spectrum, transitions },
      },
      fieldConvention: metadata.fieldConvention,
    };
  } else {
    const { inputSpectrum, boundaryDelta, ...momentArrays } = arrays;
    value = {
      kind: "state",
      observation: {
        ...metadata.observation,
        ...momentArrays,
        spectrum: {
          ...metadata.observation?.spectrum,
          inputSpectrum,
          boundaryDelta,
        },
      },
      material: metadata.material,
    };
  }
  if (!validValue(value))
    throw new TypeError("Invalid decoded structure observation/topology");
  return value;
}
function equalBytes(a, b) {
  return a.byteLength === b.byteLength && a.every((value, i) => value === b[i]);
}
async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle)
    throw new Error("Web Crypto SHA-256 is unavailable");
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function createStructureExportSampleIdentity(sample) {
  if (!hasRenderAuthority(sample?.featureFrame)) return null;
  const observation = sample.featureFrame.observation;
  return Object.freeze({
    producerSessionId: String(sample.producerSessionId ?? "").slice(0, 96),
    ...Object.fromEntries(REVISIONS.map((key) => [key, observation[key]])),
    frameId: observation.frameId,
    sourcePhase: observation.sourcePhase,
    endSample: observation.endSample,
    materialKey: JSON.stringify(material(sample.materialControls)),
  });
}
export function areStructureExportSampleIdentitiesEqual(a, b) {
  return a && b
    ? [
        "producerSessionId",
        ...REVISIONS,
        "frameId",
        "sourcePhase",
        "endSample",
        "materialKey",
      ].every((key) => a[key] === b[key])
    : a === b;
}

/** Source reads refresh this derived cache; neither hashing nor replay sends audio commands. */
export function createStructureExportProjector() {
  let cache = null;
  return {
    async project(sample, { knownTopologyKey = null } = {}) {
      if (!hasRenderAuthority(sample?.featureFrame)) return null;
      const sampleIdentity = createStructureExportSampleIdentity(sample);
      const topology = sample.featureFrame.topology,
        observation = sample.featureFrame.observation;
      const topologyPayload = encodeStructureExportPayload({
        kind: "topology",
        topology,
        fieldConvention: {
          representation: "full-shell-quadratic-gorkov-v1",
          coordinateHalfExtent: 1,
          pressureEnergyWeight: contrast.pressureEnergyWeight,
          velocityEnergyWeight: contrast.velocityEnergyWeight,
        },
      });
      const epoch = REVISIONS.map((key) => topology[key]).join(":");
      if (cache?.epoch === epoch && !equalBytes(cache.payload, topologyPayload))
        throw new Error("Static export topology changed without a revision");
      if (!cache || cache.epoch !== epoch)
        cache = {
          epoch,
          payload: topologyPayload,
          digest: sha256Hex(topologyPayload),
        };
      // Capture this cache entry before awaiting. An old hash completion cannot
      // replace a newer source epoch or mutate that epoch's cached topology.
      const current = cache;
      const statePayload = encodeStructureExportPayload({
        kind: "state",
        observation,
        material: material(sample.materialControls),
      });
      const [topologyKey, stateDigest] = await Promise.all([
        current.digest,
        sha256Hex(statePayload),
      ]);
      return Object.freeze({
        sampleIdentity,
        topologyKey,
        topology:
          knownTopologyKey === topologyKey
            ? null
            : Object.freeze({
                payload: current.payload.slice(),
                digest: topologyKey,
              }),
        state: Object.freeze({ payload: statePayload, digest: stateDigest }),
      });
    },
  };
}
