import { describe, expect, it, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../../../engine/src/testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import {
  createFeatureFrameResolver,
  resolveFeatureFrame,
} from "./baryonEngineRenderLoop.js";

function harness() {
  const f = createAudioFeaturePacketFixture(),
    model = f.model();
  let latest = model;
  const runtimeStatus = {
    ...model.topology,
    phase: "running",
    state: "ready",
    latestAcceptedFrameId: 1,
  };
  const runtimeState = { responseEnvelope: 0.8 };
  const featureRuntime = {
    readLatestFeatureModel: vi.fn(() => latest),
    getStatus: vi.fn(() => runtimeStatus),
    start: vi.fn(),
    configure: vi.fn(),
  };
  const args = {
    featureRuntime,
    runtimeState,
    runtimeDiagnostics: { engine: {}, modalFreshness: {} },
    status: {
      sourceSession: { kind: "file", sessionId: 73, timelineRevision: 0 },
      isPlaying: true,
    },
    controls: {},
    clockMode: "playback",
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: null },
        pausedFileFrameRef: { current: null },
      },
    },
  };
  return {
    f,
    model,
    runtimeStatus,
    featureRuntime,
    runtimeState,
    args,
    setModel(value) {
      latest = value;
    },
  };
}

describe("v3 app frame selection", () => {
  it("selects the immutable worker model without flattening or copying its acoustic state", () => {
    const h = harness(),
      result = resolveFeatureFrame(h.args);
    expect(result.featureFrame).toBe(createRendererFeatureView(h.model));
    expect(result.effectiveFrame.observation).toBe(h.model.observation);
    expect(h.featureRuntime.readLatestFeatureModel).toHaveBeenCalledOnce();
  });
  it.each(["paused", "draining"])(
    "keeps authoritative %s response despite stale UI playback metadata",
    (phase) => {
      const h = harness(),
        current = Object.freeze({
          ...h.model,
          observation: Object.freeze({
            ...h.model.observation,
            frameId: 2,
            sourcePhase: phase,
          }),
        });
      h.setModel(current);
      h.runtimeStatus.phase = phase;
      h.runtimeStatus.latestAcceptedFrameId = 2;
      h.args.status.isPlaying = false;
      h.args.status.isPlaybackPaused = phase === "paused";
      h.args.status.lastPlaybackEndReason = "natural";
      h.args.clockMode = "realtime";
      const result = resolveFeatureFrame(h.args);
      expect(result.effectiveFrame).toBe(createRendererFeatureView(current));
      expect(result.effectiveFrame.audioMotionAuthority).toBe(
        phase !== "paused",
      );
      expect(h.runtimeState.responseEnvelope).toBe(0.8);
      expect(
        h.args.renderLoopRefs.frameCacheRefs.pausedFileFrameRef.current,
      ).toBe(null);
    },
  );
  it("does not reject a live v3 packet because a retired flat source-evidence flag is absent", () => {
    const h = harness();
    h.args.status = {
      sourceSession: { kind: "system", sessionId: 73 },
      isLiveInputActive: true,
    };
    expect(resolveFeatureFrame(h.args).effectiveFrame).toBe(
      createRendererFeatureView(h.model),
    );
  });
  it("a seek/new epoch or revoked authority cannot resurrect the previous cached model", () => {
    const h = harness(),
      resolver = createFeatureFrameResolver();
    resolver.resolve(h.args);
    h.runtimeStatus.timelineRevision++;
    expect(resolver.resolve(h.args).effectiveFrame).toBe(null);
    h.runtimeStatus.timelineRevision--;
    h.runtimeStatus.renderAuthorityRevoked = true;
    expect(resolver.resolve(h.args).effectiveFrame).toBe(null);
    h.runtimeStatus.renderAuthorityRevoked = false;
    h.setModel(null);
    expect(resolver.resolve(h.args).effectiveFrame).toBe(null);
    expect(h.featureRuntime.start).not.toHaveBeenCalled();
    expect(h.featureRuntime.configure).not.toHaveBeenCalled();
  });
  it("reuses one validated view across repeated camera and telemetry reads", () => {
    const h = harness(),
      resolver = createFeatureFrameResolver();
    const first = resolver.resolve(h.args);
    for (let n = 0; n < 10; n++) {
      h.runtimeStatus.queueDepth = n;
      h.runtimeStatus.reason = `telemetry-${n}`;
      h.args.status.playbackSessionId = n;
      const next = resolver.resolve(h.args);
      expect(next.effectiveFrame).toBe(first.effectiveFrame);
    }
    const next = h.f.model();
    h.setModel(next);
    h.runtimeStatus.latestAcceptedFrameId = next.observation.frameId;
    expect(resolver.resolve(h.args).effectiveFrame).toBe(
      createRendererFeatureView(next),
    );
    expect(resolver.resolve(h.args).effectiveFrame).not.toBe(
      first.effectiveFrame,
    );
    expect(h.featureRuntime.start).not.toHaveBeenCalled();
    expect(h.featureRuntime.configure).not.toHaveBeenCalled();
  });
  it("rejects malformed complete models without crashing the render loop or repairing their data", () => {
    const h = harness(),
      bad = structuredClone(h.model);
    bad.observation.pressureMoments = new Float64Array(1);
    h.setModel(bad);
    expect(() => resolveFeatureFrame(h.args)).not.toThrow();
    expect(resolveFeatureFrame(h.args).effectiveFrame).toBe(null);
    expect(bad.observation.pressureMoments.length).toBe(1);
  });
});

describe("v3 render quality inputs", () => {
  it("reads the complete static basis without a display capacity, phase slots or energy threshold", async () => {
    const { resolveRaymarchFieldAnalysisFrameInputs } =
      await import("./baryonEngineRenderLoop.js");
    const h = harness(),
      frame = createRendererFeatureView(h.model);
    const state = {
      fieldSource: { read: () => ({ topology: frame.topology }) },
    };
    expect(resolveRaymarchFieldAnalysisFrameInputs(state, frame)).toEqual({
      familyCount: 85,
      shellCount: 59,
      uploadedFamilyCount: 85,
    });
    expect(resolveRaymarchFieldAnalysisFrameInputs(state, null)).toEqual({
      familyCount: 0,
      shellCount: 0,
      uploadedFamilyCount: 85,
    });
  });
  it("adapts only ray-integration quality and never changes or subsets the audio model", async () => {
    const { updateAdaptiveRaymarchStepBudget } =
      await import("./baryonEngineRenderLoop.js");
    const { createRuntimeDiagnostics } =
      await import("./baryonEngineRuntimeState.js");
    const { setupRaymarch, disposeRaymarch } =
      await import("../../../../engine/src/core/raymarchSetup.js");
    const THREE = await import("three");
    const h = harness(),
      frame = createRendererFeatureView(h.model),
      before = structuredClone(h.model);
    const state = setupRaymarch(new THREE.BoxGeometry(1, 1, 1), {
      radius: 3,
      volumeShape: "sphere",
    });
    try {
      const diagnostics = createRuntimeDiagnostics();
      for (let n = 0; n < 30; n++) {
        diagnostics.lastFrameTimeMs = 45;
        updateAdaptiveRaymarchStepBudget({
          controls: { raymarchSteps: 192 },
          runtime: { method: "raymarch" },
          runtimeState: state,
          renderProfile: { qualityPreset: "auto", targetFps: 60 },
          effectiveFrame: frame,
          status: {},
          runtimeDiagnostics: diagnostics,
        });
      }
      expect(h.model).toEqual(before);
      expect(state.fieldSource.read().basisCompileCount).toBe(0);
      expect(state.adaptiveRaymarchController.adaptiveRaymarchActive).toBe(
        true,
      );
      expect(state.adaptiveRaymarchController.familyCount).toBe(85);
      expect(state.uniforms.uRaymarchSteps.value).toBeLessThanOrEqual(192);
    } finally {
      disposeRaymarch(state);
    }
  });
});
