import { describe, expect, it, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "../../utils/audio/audioFeaturePacketCodec.js";
import { createBroadbandFieldSource } from "./broadbandFieldSource.js";
import {
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
} from "./quantityLedger.js";
import {
  queueRaymarchObservation,
  revokeRaymarchObservationHistory,
  tickRaymarchRuntime,
  prepareRaymarchRuntime,
  disposeRaymarchRuntime,
} from "./runtime.js";

function harness() {
  let step = null,
    token = null,
    hasHistory = false;
  const bundle = {
    update: vi.fn(),
    compile: vi.fn(async () => {}),
    prepare: vi.fn(),
    evaluateAperture: vi.fn(),
    setApertureRadius: vi.fn(() => false),
    dispose: vi.fn(),
    textureBytes: 16,
  };
  const create = vi.fn(() => ({ ...bundle }));
  const state = {
    presentationReady: true,
    uniforms: { uTime: { value: 0 }, uDensityGain: { value: 1 } },
    fieldSource: createBroadbandFieldSource({
      create,
      getApertureRadius: () => 3,
    }),
    volumeMesh: {
      visible: false,
      userData: { raymarchVolumeShape: "sphere", raymarchBaseRadius: 3 },
      material: { uuid: "material-a" },
      clone: () => ({}),
    },
    idleOverlay: { visible: true },
    cymaticObserverTuning: { geometryExposureSeconds: 0.4 },
    fieldCache: {
      compile: vi.fn(async () => {}),
      bake: vi.fn((_renderer, options) => {
        const next = Math.floor(options.observationTimeSeconds * 60 + 1e-10);
        const reset = token !== options.observationResetToken;
        const baked = reset || next > step;
        step = next;
        token = options.observationResetToken;
        hasHistory = true;
        return { baked, reset };
      }),
      getObserverState: () => ({ hasHistory }),
      dispose: vi.fn(),
    },
    plasmaProfileLookup: { dispose: vi.fn() },
  };
  return { state, create, bundle, renderer: {} };
}
function model(f) {
  return f.model();
}
function view(m) {
  return createRendererFeatureView(m);
}
function render(h, m) {
  tickRaymarchRuntime(h.state, view(m), 1, 1 / 60, h.renderer);
}

describe("v3 renderer observation lifecycle", () => {
  it("does not admit observer history before the renderer is prepared", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture();
    h.state.presentationReady = false;
    const first = f.model();
    expect(queueRaymarchObservation(h.state, first)).toBe(false);
    expect(h.state.observationHistory ?? null).toBeNull();
    expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
    expect(f.state.acceptedBlocks).toBe(1);
  });

  it("drains every retained endpoint in order in one presentation without advancing audio", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture();
    const models = Array.from({ length: 10 }, () => model(f));
    models.forEach((m) => queueRaymarchObservation(h.state, m));
    render(h, models.at(-1));
    expect(h.state.observationHistory.read()).toMatchObject({
      queued: 0,
      accepted: 10,
      consumed: 10,
      fault: null,
    });
    expect(h.bundle.update.mock.calls.map(([o]) => o.endSample)).toEqual(
      models.map((m) => m.observation.endSample),
    );
    expect(h.create).toHaveBeenCalledOnce();
    expect(f.state.acceptedBlocks).toBe(10);
  });
  it.each([15, 24, 30])(
    "keeps the complete observation timeline at %i FPS and after a 300 ms presentation stall",
    (fps) => {
      const h = harness(),
        f = createAudioFeaturePacketFixture();
      const models = [];
      let nextPresentationTime = 0;
      for (let n = 0; n < 200; n++) {
        const m = model(f);
        models.push(m);
        queueRaymarchObservation(h.state, m);
        const time = m.observation.endSample / m.topology.sampleRate;
        if (time < nextPresentationTime || (time >= 0.5 && time < 0.8))
          continue;
        render(h, m);
        expect(h.state.observationHistory.read().queued).toBe(0);
        nextPresentationTime = time + 1 / fps;
      }
      render(h, models.at(-1));
      expect(h.bundle.update.mock.calls.map(([o]) => o.endSample)).toEqual(
        models.map((m) => m.observation.endSample),
      );
      expect(h.state.presentationFailure ?? null).toBeNull();
      expect(h.state.volumeMesh.visible).toBe(true);
      expect(h.create).toHaveBeenCalledOnce();
      expect(f.state.acceptedBlocks).toBe(models.length);
      const uploads = h.bundle.update.mock.calls.length;
      const bakes = h.state.fieldCache.bake.mock.calls.length;
      render(h, models.at(-1));
      expect(h.bundle.update).toHaveBeenCalledTimes(uploads);
      expect(h.state.fieldCache.bake).toHaveBeenCalledTimes(bakes);
    },
  );
  it("cached frames, camera ticks and mirrored replay cannot repeat uploads or bakes", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture(),
      m = model(f);
    render(h, m);
    for (let n = 0; n < 10; n++) {
      render(h, m);
      queueRaymarchObservation(h.state, structuredClone(m));
    }
    expect(h.bundle.update).toHaveBeenCalledOnce();
    expect(h.state.fieldCache.bake).toHaveBeenCalledOnce();
    expect(h.create).toHaveBeenCalledOnce();
    expect(f.state.acceptedBlocks).toBe(1);
  });
  it("a paused phase update holds the exact field, while an explicit radius change reseeds it once", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture(),
      m = model(f);
    render(h, m);
    const paused = {
      topology: m.topology,
      observation: { ...m.observation, frameId: 2, sourcePhase: "paused" },
    };
    render(h, paused);
    expect(h.state.fieldCache.bake).toHaveBeenCalledOnce();
    h.state.volumeMesh.userData.raymarchBaseRadius = 4;
    render(h, paused);
    render(h, paused);
    expect(h.state.fieldCache.bake).toHaveBeenCalledTimes(2);
    expect(h.bundle.update).toHaveBeenCalledOnce();
    expect(f.state.acoustic.read().response.sampleIndex).toBe(512);
  });
  it("a new source revokes old pending presentation and closes admission until its resources are prepared", () => {
    const h = harness(),
      old = createAudioFeaturePacketFixture().model(),
      next = createAudioFeaturePacketFixture({ sourceGeneration: 2 }).model();
    queueRaymarchObservation(h.state, old);
    expect(queueRaymarchObservation(h.state, next)).toBe(false);
    expect(h.state.presentationReady).toBe(false);
    expect(h.state.observationHistory).toBeNull();
    expect(queueRaymarchObservation(h.state, old)).toBe(false);
    expect(h.bundle.update).not.toHaveBeenCalled();
  });
  it("overflow fails presentation explicitly and cannot restart audio or silently coalesce history", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture();
    for (let n = 0; n < 64; n++) queueRaymarchObservation(h.state, model(f));
    const extra = model(f);
    expect(() => queueRaymarchObservation(h.state, extra)).toThrow(/capacity/);
    render(h, extra);
    expect(h.state.volumeMesh.visible).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.state.observationHistory.read().queued).toBe(64);
    expect(f.state.acceptedBlocks).toBe(65);
  });
  it("a recreated renderer replays one current model with no acoustic progression", () => {
    const first = harness(),
      replacement = harness(),
      f = createAudioFeaturePacketFixture(),
      m = model(f);
    render(first, m);
    disposeRaymarchRuntime(first.state);
    render(replacement, m);
    render(replacement, m);
    expect(first.bundle.dispose).toHaveBeenCalledOnce();
    expect(replacement.create).toHaveBeenCalledOnce();
    expect(replacement.state.fieldCache.bake).toHaveBeenCalledOnce();
    expect(f.state.acceptedBlocks).toBe(1);
  });
  it("invalid authority hides presentation without consuming queued physics", () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture(),
      m = model(f);
    queueRaymarchObservation(h.state, m);
    tickRaymarchRuntime(h.state, { renderAuthority: false }, 1, 0, h.renderer);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.state.observationHistory.read().queued).toBe(1);
    expect(h.state.volumeMesh.visible).toBe(false);
    expect(h.state.debugSnapshot).toMatchObject({
      renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
      opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      normalizationEnergy: null,
      renderAuthority: false,
    });
  });
  it("compilation and derived warm-up admit no history; ordinary activation starts from the current complete model", async () => {
    const h = harness(),
      f = createAudioFeaturePacketFixture(),
      first = model(f);
    const renderer = {
      compileAsync: vi.fn(async () => {}),
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
    };
    const options = { camera: {}, scene: {} };
    h.state.presentationReady = false;
    expect(
      prepareRaymarchRuntime(h.state, first, renderer, options).pending,
    ).toBe(true);
    const pending = h.state.preparation.promise;
    for (let i = 0; i < 80; i++)
      expect(queueRaymarchObservation(h.state, model(f))).toBe(false);
    await pending;
    expect(h.state.presentationReady).toBe(false);
    expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
    expect(h.state.observationHistory).toBeNull();
    const current = model(f);
    expect(
      prepareRaymarchRuntime(h.state, current, renderer, options).pending,
    ).toBe(true);
    expect(h.bundle.prepare).toHaveBeenCalledOnce();
    expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
    expect(
      prepareRaymarchRuntime(h.state, current, renderer, options),
    ).toMatchObject({ ready: true, activated: true });
    render(h, current);
    const next = model(f);
    queueRaymarchObservation(h.state, next);
    render(h, next);
    expect(h.state.observationHistory.read()).toMatchObject({
      accepted: 2,
      consumed: 2,
      fault: null,
    });
    expect(h.bundle.update.mock.calls.map(([o]) => o.endSample)).toEqual(
      [first, current, next].map((m) => m.observation.endSample),
    );
    expect(
      prepareRaymarchRuntime(h.state, next, renderer, options),
    ).toMatchObject({ ready: true, activated: false });
    expect(renderer.compileAsync).toHaveBeenCalledOnce();
    expect(f.state.acceptedBlocks).toBe(83);
  });

  it.each(["before", "after"])(
    "a changed source intent arriving %s compilation completion cannot activate the old source or dispose in-flight resources",
    async (order) => {
      const h = harness(),
        first = createAudioFeaturePacketFixture().model(),
        next = createAudioFeaturePacketFixture({ sourceGeneration: 2 }).model();
      let finish;
      h.bundle.compile.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const renderer = {
          compileAsync: vi.fn(async () => {}),
          getRenderTarget: () => null,
          setRenderTarget: vi.fn(),
        },
        options = { camera: {}, scene: {} };
      prepareRaymarchRuntime(h.state, first, renderer, options);
      const old = h.state.preparation;
      if (order === "before") {
        prepareRaymarchRuntime(h.state, next, renderer, options);
        expect(h.state.preparation).toBe(old);
        expect(h.bundle.dispose).not.toHaveBeenCalled();
      }
      finish();
      await old.promise;
      prepareRaymarchRuntime(h.state, next, renderer, options);
      expect(h.bundle.dispose).toHaveBeenCalledOnce();
      expect(h.state.presentationReady).toBe(false);
      await h.state.preparation.promise;
      prepareRaymarchRuntime(h.state, next, renderer, options);
      prepareRaymarchRuntime(h.state, next, renderer, options);
      expect(queueRaymarchObservation(h.state, next)).toBe(true);
      expect(queueRaymarchObservation(h.state, first)).toBe(false);
      expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
      expect(
        prepareRaymarchRuntime(h.state, first, renderer, options).reason,
      ).toBe("stale-topology");
      expect(h.state.presentationReady).toBe(true);
      h.state.uniforms.uTime.value = 10;
      render(h, first);
      expect(h.state.uniforms.uTime.value).toBe(10);
      expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
    },
  );

  it("caches a synchronous GPU resource allocation failure instead of allocating on every read", () => {
    const h = harness(),
      first = createAudioFeaturePacketFixture().model(),
      renderer = {
        compileAsync: vi.fn(),
        getRenderTarget: () => null,
        setRenderTarget: vi.fn(),
      },
      options = { camera: {}, scene: {} };
    h.create.mockImplementationOnce(() => {
      throw new Error("resource allocation failed");
    });
    for (let i = 0; i < 10; i++)
      expect(
        prepareRaymarchRuntime(h.state, first, renderer, options),
      ).toMatchObject({
        ready: false,
        pending: false,
        error: "resource allocation failed",
      });
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
  });

  it("failed preparation cannot retry on cached reads; disposal prevents late compilation from activating", async () => {
    const h = harness(),
      first = createAudioFeaturePacketFixture().model(),
      renderer = {
        compileAsync: vi.fn(async () => {}),
        getRenderTarget: () => null,
        setRenderTarget: vi.fn(),
      },
      options = { camera: {}, scene: {} };
    h.bundle.compile.mockRejectedValueOnce(new Error("compile failed"));
    prepareRaymarchRuntime(h.state, first, renderer, options);
    await h.state.preparation.promise;
    for (let i = 0; i < 10; i++)
      expect(
        prepareRaymarchRuntime(h.state, first, renderer, options).error,
      ).toBe("compile failed");
    expect(h.bundle.compile).toHaveBeenCalledOnce();
    const next = createAudioFeaturePacketFixture({
      sourceGeneration: 2,
    }).model();
    let finish;
    h.bundle.compile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    prepareRaymarchRuntime(h.state, next, renderer, options);
    const pending = h.state.preparation;
    disposeRaymarchRuntime(h.state);
    finish();
    await pending.promise;
    expect(h.state.presentationReady).toBe(false);
    expect(pending.compiled).toBe(false);
    expect(h.state.fieldCache.compile).not.toHaveBeenCalled();
    expect(h.state.fieldCache.bake).not.toHaveBeenCalled();
    expect(h.bundle.prepare).not.toHaveBeenCalled();
    expect(prepareRaymarchRuntime(h.state, next, renderer, options).ready).toBe(
      false,
    );
  });
});

it("a presentation reconnect discards missing history and reseeds the same acoustic model once without another upload or source interval", () => {
  const h = harness(),
    f = createAudioFeaturePacketFixture(),
    first = model(f);
  queueRaymarchObservation(h.state, first);
  render(h, first);
  const originalToken = h.state.lastObserverResetToken;
  revokeRaymarchObservationHistory(h.state);
  // The unchanged compiled basis is reactivated by the presentation owner.
  h.state.presentationReady = true;
  expect(h.state.observationHistory).toBeNull();
  expect(h.state.volumeMesh.visible).toBe(false);
  expect(queueRaymarchObservation(h.state, first)).toBe(true);
  render(h, first);
  expect(h.state.lastObserverResetToken).not.toBe(originalToken);
  expect(h.state.fieldCache.bake).toHaveBeenCalledTimes(2);
  expect(h.bundle.update).toHaveBeenCalledOnce();
  render(h, first);
  expect(h.state.fieldCache.bake).toHaveBeenCalledTimes(2);
  expect(f.state.acceptedBlocks).toBe(1);
});
