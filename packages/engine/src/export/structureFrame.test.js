import { describe, expect, it } from "vitest";
import { createAudioFeaturePacketFixture } from "../testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "../utils/audioFeatures.js";
import { isCompleteAudioFeatureModel } from "../contracts/audioFeatureProtocol.js";
import {
  createStructureExportProjector,
  decodeStructureExportPayload,
  encodeStructureExportPayload,
  createStructureExportSampleIdentity,
  areStructureExportSampleIdentitiesEqual,
  STRUCTURE_EXPORT_SCHEMA_VERSION,
} from "./structureFrame.js";
function fixture(configuration = {}) {
  const source = createAudioFeaturePacketFixture({
    configuration,
    sourceGeneration: 2 ** 31 + 5,
  });
  const model = source.model();
  return {
    source,
    model,
    sample: {
      producerSessionId: "producer",
      featureFrame: createRendererFeatureView(model),

      materialControls: {
        colorMode: "spectral",
        volumeColorRgb: [0.1, 0.2, 0.3],
        surfaceColorRgb: [0.7, 0.8, 0.9],
      },
    },
  };
}
function expectArrays(actual, expected) {
  for (const key of Object.keys(expected)) {
    const a = actual[key],
      e = expected[key];
    if (ArrayBuffer.isView(e)) {
      expect(a.constructor).toBe(e.constructor);
      expect(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).toEqual(
        new Uint8Array(e.buffer, e.byteOffset, e.byteLength),
      );
    } else if (e && typeof e === "object") expectArrays(a, e);
    else expect(a).toEqual(e);
  }
}
describe("lossless full-model structure export v5", () => {
  it.each(["neumann", "dirichlet"])(
    "roundtrips the complete %s basis, raw moments and every response-spectrum bin",
    async (boundaryMode) => {
      const f = fixture({ boundaryMode }),
        result = await createStructureExportProjector().project(f.sample);
      expect(STRUCTURE_EXPORT_SCHEMA_VERSION).toBe(5);
      const topology = decodeStructureExportPayload(result.topology.payload),
        state = decodeStructureExportPayload(result.state.payload);
      expect(topology.kind).toBe("topology");
      expect(state.kind).toBe("state");
      expectArrays(topology.topology, f.model.topology);
      expectArrays(state.observation, f.model.observation);
      expect(
        isCompleteAudioFeatureModel({
          topology: topology.topology,
          observation: state.observation,
        }),
      ).toBe(true);
      expect(state.observation.sourceGeneration).toBe(2 ** 31 + 5);
      expect(state).not.toHaveProperty("appliedControlRevision");
      expect(state).not.toHaveProperty("resolvedSemanticRevision");
      expect(topology.fieldConvention).toMatchObject({
        representation: "full-shell-quadratic-gorkov-v1",
        coordinateHalfExtent: 1,
      });
      expect(state).not.toHaveProperty("phaseOffsets");
      expect(topology).not.toHaveProperty("modeCap");
    },
  );
  it("caches topology across observations and controls while requiring fresh dynamic snapshots", async () => {
    const f = fixture(),
      projector = createStructureExportProjector(),
      first = await projector.project(f.sample);
    const next = await projector.project(
      {
        ...f.sample,
        featureFrame: createRendererFeatureView({
          topology: f.model.topology,
          observation: f.source.advance(),
        }),

        materialControls: { colorMode: "static", volumeColorRgb: "#123456" },
      },
      { knownTopologyKey: first.topologyKey },
    );
    expect(next.topologyKey).toBe(first.topologyKey);
    expect(next.topology).toBe(null);
    expect(next.state.digest).not.toBe(first.state.digest);
    expect(
      decodeStructureExportPayload(next.state.payload).observation.endSample,
    ).toBe(1024);
  });
  it("canonical topology identity is independent of object property insertion order", async () => {
    const f = fixture(),
      projector = createStructureExportProjector(),
      first = await projector.project(f.sample);
    const topology = Object.fromEntries(
      Object.entries(f.model.topology).reverse(),
    );
    topology.spectrum = Object.fromEntries(
      Object.entries(topology.spectrum).reverse(),
    );
    const next = await projector.project({
      ...f.sample,
      featureFrame: createRendererFeatureView({
        topology,
        observation: f.model.observation,
      }),
    });
    expect(next.topologyKey).toBe(first.topologyKey);
  });
  it("transfer detaches only export-owned payloads, not audio or cached topology", async () => {
    const f = fixture(),
      projector = createStructureExportProjector(),
      first = await projector.project(f.sample);
    const received = structuredClone(first, {
      transfer: [first.state.payload.buffer, first.topology.payload.buffer],
    });
    expect(first.state.payload.byteLength).toBe(0);
    expect(isCompleteAudioFeatureModel(f.model)).toBe(true);
    expectArrays(
      decodeStructureExportPayload(received.state.payload).observation,
      f.model.observation,
    );
    const replay = await projector.project(f.sample);
    expect(replay.topology.payload.byteLength).toBeGreaterThan(0);
    expect(replay.topologyKey).toBe(first.topologyKey);
  });
  it("keeps tiny raw values and held phase without Float32 quantization or local-time advancement", async () => {
    const f = fixture();
    const model = structuredClone(f.model),
      gain = 1e-80;
    for (const key of ["pressure", "velocity"])
      model.observation[key] = model.observation[key].map((x) => x * gain);
    for (const key of ["pressureMoments", "velocityMoments"])
      model.observation[key] = model.observation[key].map(
        (x) => x * gain * gain,
      );
    model.observation.normalizationEnergy *= gain * gain;
    model.observation.sourcePhase = "paused";
    for (const key of ["inputSpectrum", "boundaryDelta"])
      model.observation.spectrum[key] = model.observation.spectrum[key].map(
        (x) => x * gain,
      );
    const result = await createStructureExportProjector().project({
      ...f.sample,
      featureFrame: createRendererFeatureView(model),
    });
    expectArrays(
      decodeStructureExportPayload(result.state.payload).observation,
      model.observation,
    );
  });
  it("rejects unversioned phase frames and explicitly revoked authority", async () => {
    const projector = createStructureExportProjector(),
      f = fixture();
    expect(
      await projector.project({
        featureFrame: {
          phaseOffsets: new Float32Array(1),
          renderAuthority: true,
        },
      }),
    ).toBe(null);
    expect(
      await projector.project({
        ...f.sample,
        featureFrame: { ...f.sample.featureFrame, renderAuthority: false },
      }),
    ).toBe(null);
  });
  it("rejects a static mutation inside one topology epoch rather than inventing a new export basis", async () => {
    const f = fixture(),
      projector = createStructureExportProjector();
    await projector.project(f.sample);
    const changed = structuredClone(f.model);
    changed.topology.sourceOverlaps = changed.topology.sourceOverlaps.map(
      (x) => 2 * x,
    );
    changed.observation.normalizationEnergy *= 4;
    expect(isCompleteAudioFeatureModel(changed)).toBe(true);
    await expect(
      projector.project({
        ...f.sample,
        featureFrame: createRendererFeatureView(changed),
      }),
    ).rejects.toThrow(/without a revision/);
  });
  it("sample identity covers all acoustic revisions and canonical exported material", () => {
    const f = fixture(),
      first = createStructureExportSampleIdentity(f.sample);
    expect(
      areStructureExportSampleIdentitiesEqual(
        first,
        createStructureExportSampleIdentity(f.sample),
      ),
    ).toBe(true);
    const materialChange = {
      ...f.sample,
      materialControls: { ...f.sample.materialControls, spectralChroma: 0.3 },
    };
    expect(
      areStructureExportSampleIdentitiesEqual(
        first,
        createStructureExportSampleIdentity(materialChange),
      ),
    ).toBe(false);
    expect(
      areStructureExportSampleIdentitiesEqual(
        first,
        createStructureExportSampleIdentity({
          ...f.sample,
          irrelevantRenderTelemetry: 42,
        }),
      ),
    ).toBe(true);
    const changed = structuredClone(f.sample);
    changed.featureFrame.observation.processingRevision++;
    changed.featureFrame.topology.processingRevision++;
    expect(
      areStructureExportSampleIdentitiesEqual(
        first,
        createStructureExportSampleIdentity(changed),
      ),
    ).toBe(false);
  });
  it("binary decoding rejects unknown versions, truncation, trailing bytes and malformed descriptors", async () => {
    const result = await createStructureExportProjector().project(
        fixture().sample,
      ),
      bytes = result.state.payload;
    expect(() =>
      decodeStructureExportPayload(bytes.subarray(0, bytes.length - 1)),
    ).toThrow();
    const extra = new Uint8Array(bytes.length + 1);
    extra.set(bytes);
    expect(() => decodeStructureExportPayload(extra)).toThrow();
    const invalid = bytes.slice();
    invalid[0] = 0;
    expect(() => decodeStructureExportPayload(invalid)).toThrow();
    expect(() =>
      encodeStructureExportPayload({
        kind: "state",
        observation: { pressureMoments: new Float64Array([NaN]) },
      }),
    ).toThrow();
  });
});
