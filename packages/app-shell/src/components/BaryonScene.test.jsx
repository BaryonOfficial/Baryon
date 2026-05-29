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
  invalidateSpy,
  postNodesRef,
  useBaryonPipelineSpy,
  useBaryonVisualizerSpy,
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
  invalidateSpy: vi.fn(),
  useBaryonPipelineSpy: vi.fn(),
  postNodesRef: {
    current: {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    },
  },
  useBaryonVisualizerSpy: vi.fn(() => null),
}));

vi.mock("@react-three/fiber", () => ({
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
  OrbitControls: React.forwardRef(function OrbitControls(_props, ref) {
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

vi.mock("./hooks/useBaryonVisualizer", () => ({
  useBaryonVisualizer: (...args) => useBaryonVisualizerSpy(...args),
}));

vi.mock("./hooks/useDefaultBaryonGeometry", () => ({
  useDefaultBaryonGeometry: () => null,
}));

import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene.jsx";

function createSceneProps(cameraPose, overrides = {}) {
  return {
    setIsEngineReady: () => {},
    setLiveInputRuntimeStatus: () => {},
    liveInputUiState: "active",
    liveInputErrorCode: null,
    controlsRef: { current: {} },
    visualizationMethod: "raymarch",
    renderQualityPreset: "auto",
    cameraPose,
    cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
    ...overrides,
  };
}

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

  expect(cameraState.positionSet).toHaveBeenLastCalledWith(0, 0, 9);
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

test("TRAA is enabled only for the rotatable 3D-volume raymarch method", async () => {
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
  expect(lastResolvedRenderProfile()?.traaEnabled).toBe(true);

  await act(async () => {
    root.render(
      React.createElement(
        BaryonScene,
        createSceneProps(resolvePresetCameraPose("top-down"), {
          visualizationMethod: "fullscreen-volume",
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

afterEach(() => {
  useBaryonPipelineSpy.mockClear();
  cameraState.positionSet.mockClear();
  cameraState.upSet.mockClear();
  cameraState.lookAt.mockClear();
  cameraState.updateProjectionMatrix.mockClear();
  cameraState.updateMatrixWorld.mockClear();
  controlsState.targetSet.mockClear();
  controlsState.update.mockClear();
  disposePipelineSpy.mockClear();
  invalidateSpy.mockClear();
  useBaryonVisualizerSpy.mockClear();
  postNodesRef.current = {
    traaNode: {},
    temporalHistoryBlendUniform: { value: 1 },
  };
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
