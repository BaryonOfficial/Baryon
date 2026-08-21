// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resolvePresetCameraPose } from "./cameraPosePresets.js";

const {
  cameraState,
  controlsState,
  disposePipelineSpy,
  frameCallbacks,
  invalidateSpy,
  orbitControlProps,
  postNodesRef,
  useBaryonPipelineSpy,
  useBaryonEngineSpy,
} = vi.hoisted(() => ({
  cameraState: {
    positionSet: vi.fn(),
    upSet: vi.fn(),
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
    updateMatrixWorld: vi.fn(),
  },
  controlsState: {
    targetSet: vi.fn(),
    update: vi.fn(),
  },
  disposePipelineSpy: vi.fn(),
  frameCallbacks: [],
  invalidateSpy: vi.fn(),
  orbitControlProps: [],
  useBaryonPipelineSpy: vi.fn(),
  postNodesRef: {
    current: {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    },
  },
  useBaryonEngineSpy: vi.fn(() => ({
    points: null,
  })),
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback) => {
    frameCallbacks.push(callback);
  },
  useThree: () => ({
    camera: {
      position: { set: cameraState.positionSet },
      up: { set: cameraState.upSet },
      fov: 65,
      lookAt: cameraState.lookAt,
      updateProjectionMatrix: cameraState.updateProjectionMatrix,
      updateMatrixWorld: cameraState.updateMatrixWorld,
    },
    gl: {},
    scene: {},
    size: { width: 1280, height: 720 },
    invalidate: invalidateSpy,
  }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: React.forwardRef(function OrbitControls(props, ref) {
    orbitControlProps.push(props);
    React.useImperativeHandle(ref, () => ({
      target: { set: controlsState.targetSet },
      update: controlsState.update,
    }));
    return null;
  }),
}));

vi.mock("./hooks/useBaryonPipeline", () => ({
  useBaryonPipeline: (...args) => {
    useBaryonPipelineSpy(...args);
    return {
      ensurePipeline: () => null,
      postNodesRef,
      disposePipeline: disposePipelineSpy,
    };
  },
}));

vi.mock("./hooks/useBaryonEngine", () => ({
  useBaryonEngine: (args) => useBaryonEngineSpy(args),
}));

vi.mock("./hooks/useDefaultBaryonGeometry", () => ({
  useDefaultBaryonGeometry: () => null,
}));

import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene.jsx";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";

function createSceneProps(cameraPose, overrides = {}) {
  return {
    setIsEngineReady: () => {},
    setLiveInputRuntimeStatus: () => {},
    liveInputUiState: "active",
    liveInputErrorCode: null,
    controlsRef: { current: {} },
    visualizationMethod: "raymarch",
    performanceProfile: "auto",
    onPerformanceHudSnapshotChange: null,
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    cameraPose,
    cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
    ...overrides,
  };
}

test("mounts the engine-owned visualization root as the only program layer", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  useBaryonEngineSpy.mockReturnValueOnce({
    points: { name: "visualization" },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down")),
      ),
    );
  });

  expect(container.querySelectorAll("primitive")).toHaveLength(1);

  await act(async () => {
    root.unmount();
  });
  container.remove();
  consoleError.mockRestore();
});

test("forwards the required audio feature authority role to the engine hook", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
        }),
      ),
    );
  });

  expect(
    useBaryonEngineSpy.mock.calls.at(-1)?.[0]?.audioFeatureAuthorityRole,
  ).toBe(AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer);

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

function lastResolvedRenderProfile() {
  const lastCall = useBaryonPipelineSpy.mock.calls.at(-1);
  return lastCall ? lastCall[3] : null;
}

test("external camera pose changes apply without resetting the postprocess pipeline", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down")),
      ),
    );
  });

  disposePipelineSpy.mockClear();
  invalidateSpy.mockClear();
  postNodesRef.current.temporalHistoryBlendUniform.value = 1;
  postNodesRef.current.temporalHistoryCutFramesRemaining = 0;

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("side")),
      ),
    );
  });

  expect(cameraState.positionSet).toHaveBeenLastCalledWith(
    0,
    0,
    Math.hypot(4.5, 4.5, 4.5),
  );
  expect(controlsState.targetSet).not.toHaveBeenCalled();
  expect(cameraState.lookAt).toHaveBeenLastCalledWith(0, 0, 0);
  expect(disposePipelineSpy).not.toHaveBeenCalled();
  expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(0);
  expect(
    postNodesRef.current.temporalHistoryCutFramesRemaining,
  ).toBeGreaterThan(0);
  expect(invalidateSpy).toHaveBeenCalledTimes(1);

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("continuous external camera poses preserve temporal history until a cut nonce changes", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          cameraCutNonce: 0,
        }),
      ),
    );
  });

  postNodesRef.current.temporalHistoryBlendUniform.value = 1;
  postNodesRef.current.temporalHistoryCutFramesRemaining = 0;
  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("side"), {
          cameraCutNonce: 0,
        }),
      ),
    );
  });

  expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(1);
  expect(postNodesRef.current.temporalHistoryCutFramesRemaining).toBe(0);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          cameraCutNonce: 1,
        }),
      ),
    );
  });

  expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(0);
  expect(
    postNodesRef.current.temporalHistoryCutFramesRemaining,
  ).toBeGreaterThan(0);

  await act(async () => root.unmount());
  container.remove();
});

test("preview-local orbit changes invalidate demand frames before publishing pose", async () => {
  const onCameraPoseChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("side"), {
          cameraControlMode: CAMERA_CONTROL_MODES.previewLocal,
          onCameraPoseChange,
        }),
      ),
    );
  });

  invalidateSpy.mockClear();
  onCameraPoseChange.mockClear();
  const localCameraRenderSignalRef =
    useBaryonEngineSpy.mock.calls.at(-1)?.[0]?.localCameraRenderSignalRef;
  expect(localCameraRenderSignalRef?.current?.version).toBe(0);
  expect(localCameraRenderSignalRef?.current?.phase).toBeNull();

  await act(async () => {
    orbitControlProps.at(-1)?.onChange?.();
  });

  expect(invalidateSpy).toHaveBeenCalledTimes(1);
  expect(localCameraRenderSignalRef?.current?.version).toBe(1);
  expect(localCameraRenderSignalRef?.current?.phase).toBe("change");
  expect(onCameraPoseChange).toHaveBeenCalledWith(
    expect.objectContaining({
      phase: "change",
      cameraPose: expect.any(Object),
    }),
  );

  await act(async () => {
    orbitControlProps.at(-1)?.onEnd?.();
  });

  expect(invalidateSpy).toHaveBeenCalledTimes(2);
  expect(localCameraRenderSignalRef?.current?.version).toBe(2);
  expect(localCameraRenderSignalRef?.current?.phase).toBe("end");
  expect(onCameraPoseChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "end",
      cameraPose: expect.any(Object),
    }),
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("preview-local streamed camera poses apply during motion without publishing a drag", async () => {
  const onCameraPoseChange = vi.fn();
  const streamedCameraPoseRef = { current: null };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("side"), {
          cameraControlMode: CAMERA_CONTROL_MODES.previewLocal,
          onCameraPoseChange,
          streamedCameraPoseRef,
        }),
      ),
    );
  });

  const streamedPose = resolvePresetCameraPose("top-down");
  streamedCameraPoseRef.current = streamedPose;
  controlsState.update.mockImplementation(() => {
    orbitControlProps.at(-1)?.onChange?.();
  });
  postNodesRef.current.temporalHistoryBlendUniform.value = 1;
  postNodesRef.current.temporalHistoryCutFramesRemaining = 0;

  await act(async () => {
    frameCallbacks.at(-1)?.();
  });

  expect(cameraState.positionSet).toHaveBeenLastCalledWith(
    streamedPose.position.x,
    streamedPose.position.y,
    streamedPose.position.z,
  );
  expect(controlsState.targetSet).toHaveBeenLastCalledWith(0, 0, 0);
  expect(onCameraPoseChange).not.toHaveBeenCalled();
  expect(
    useBaryonEngineSpy.mock.calls.at(-1)?.[0]?.localCameraRenderSignalRef
      ?.current,
  ).toMatchObject({ version: 1, phase: "change" });
  expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(1);
  expect(postNodesRef.current.temporalHistoryCutFramesRemaining).toBe(0);

  await act(async () => root.unmount());
  container.remove();
});

test("preview-local camera pose mirrors do not reapply as orbit commands", async () => {
  const onCameraPoseChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("side"), {
          cameraControlMode: CAMERA_CONTROL_MODES.previewLocal,
          onCameraPoseChange,
        }),
      ),
    );
  });

  await act(async () => {
    orbitControlProps.at(-1)?.onChange?.();
  });

  const mirroredCameraPose =
    onCameraPoseChange.mock.calls.at(-1)?.[0]?.cameraPose;
  expect(mirroredCameraPose).toEqual(expect.any(Object));

  cameraState.positionSet.mockClear();
  cameraState.upSet.mockClear();
  cameraState.updateProjectionMatrix.mockClear();
  cameraState.updateMatrixWorld.mockClear();
  controlsState.targetSet.mockClear();
  controlsState.update.mockClear();
  invalidateSpy.mockClear();

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(mirroredCameraPose, {
          cameraControlMode: CAMERA_CONTROL_MODES.previewLocal,
          onCameraPoseChange,
        }),
      ),
    );
  });

  expect(cameraState.positionSet).not.toHaveBeenCalled();
  expect(cameraState.upSet).not.toHaveBeenCalled();
  expect(cameraState.updateProjectionMatrix).not.toHaveBeenCalled();
  expect(cameraState.updateMatrixWorld).not.toHaveBeenCalled();
  expect(controlsState.targetSet).not.toHaveBeenCalled();
  expect(controlsState.update).not.toHaveBeenCalled();
  expect(invalidateSpy).not.toHaveBeenCalled();

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          cameraControlMode: CAMERA_CONTROL_MODES.previewLocal,
          onCameraPoseChange,
        }),
      ),
    );
  });

  expect(cameraState.positionSet).toHaveBeenLastCalledWith(
    0,
    Math.hypot(4.5, 4.5, 4.5),
    0,
  );
  expect(controlsState.targetSet).toHaveBeenLastCalledWith(0, 0, 0);
  expect(controlsState.update).toHaveBeenCalled();

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("TRAA is disabled by default for the raymarch method", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          visualizationMethod: "raymarch",
        }),
      ),
    );
  });
  expect(lastResolvedRenderProfile()?.traaEnabled).toBe(false);

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("custom target FPS reaches the local render profile", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          performanceProfile: "custom",
          customTargetFps: 72,
        }),
      ),
    );
  });

  expect(lastResolvedRenderProfile()).toMatchObject({
    qualityPreset: "custom",
    targetFps: 72,
  });
  expect(lastResolvedRenderProfile()).not.toHaveProperty("renderScale");

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("resolved external profiles remain the output-stage render-profile owner", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          performanceProfile: "custom",
          customTargetFps: 72,
          renderContext: "external-output",
          resolvedRenderProfile: {
            qualityPreset: "custom",
            targetFps: 48,
            traaEnabled: true,
            bloomAllowed: true,
            renderContext: "external-output",
          },
        }),
      ),
    );
  });

  expect(lastResolvedRenderProfile()).toMatchObject({
    qualityPreset: "custom",
    targetFps: 48,
    renderContext: "external-output",
  });

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

afterEach(() => {
  useBaryonPipelineSpy.mockClear();
  cameraState.positionSet.mockClear();
  cameraState.upSet.mockClear();
  cameraState.lookAt.mockClear();
  cameraState.updateProjectionMatrix.mockClear();
  cameraState.updateMatrixWorld.mockClear();
  controlsState.targetSet.mockClear();
  controlsState.update.mockReset();
  disposePipelineSpy.mockClear();
  invalidateSpy.mockClear();
  useBaryonEngineSpy.mockClear();
  orbitControlProps.splice(0);
  frameCallbacks.splice(0);
  postNodesRef.current = {
    traaNode: {},
    temporalHistoryBlendUniform: { value: 1 },
  };
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
