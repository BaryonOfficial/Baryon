// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const featureRuntimeSpies = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
  configure: vi.fn(),
  setAuthorityRole: vi.fn(),
  dispose: vi.fn(),
}));

const visualizationSpies = vi.hoisted(() => ({
  create: vi.fn(),
  setup: vi.fn(() => ({ points: [] })),
  dispose: vi.fn(),
}));

vi.mock("@baryon/engine/audio-features", () => ({
  AUDIO_FEATURE_AUTHORITY_ROLES: {
    localProducer: "local-producer",
    externalConsumer: "external-consumer",
  },
  createAudioFeatureRuntime: (...args) => {
    featureRuntimeSpies.create(...args);
    return {
      start: featureRuntimeSpies.start,
      configure: featureRuntimeSpies.configure,
      setAuthorityRole: featureRuntimeSpies.setAuthorityRole,
      dispose: featureRuntimeSpies.dispose,
    };
  },
}));

vi.mock("@baryon/engine/visualization/runtime", () => ({
  createVisualizationRuntime: (...args) => {
    visualizationSpies.create(...args);
    return {
      method: "raymarch",
      setup: visualizationSpies.setup,
      dispose: visualizationSpies.dispose,
    };
  },
}));

vi.mock("./baryonEngineRuntimeState.js", () => ({
  clearFrameCache: vi.fn(),
  createEmptyControlSnapshots: (controlsSnapshot = null) => ({
    controlsSnapshot,
  }),
  createRuntimeDiagnostics: () => ({}),
  initializeAdaptiveRaymarchRuntimeState: vi.fn(),
  resetAdaptiveRaymarchControllerState: vi.fn(),
}));

vi.mock("../../context/liveInputRuntimeStatus.js", () => ({
  createLiveInputRuntimeStatus: () => ({}),
}));

import { useVisualizationRuntimeLifecycle } from "./useVisualizationRuntimeLifecycle.js";

const AUDIO_FEATURE_AUTHORITY_ROLES = {
  localProducer: "local-producer",
  externalConsumer: "external-consumer",
};

function Harness(props) {
  latestLifecycle = useVisualizationRuntimeLifecycle(props);
  return null;
}

let container;
let root;
let latestLifecycle;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  latestLifecycle = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  container?.remove();
  container = null;
  root = null;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test("feature runtime has stable session ownership and command-only role/config effects", async () => {
  const audioSession = {
    getStatus: () => ({ capacity: 16, fftSize: 8192, sampleRate: 48000 }),
  };
  const audioRef = { current: audioSession };
  const controlsRef = {
    current: {
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
      colorMode: "spectral",
    },
  };
  const baryonGeometry = {};
  const commonProps = {
    audioRef,
    baryonGeometry,
    controlsRef,
    setIsEngineReady: vi.fn(),
    setLiveInputRuntimeStatus: vi.fn(),
  };

  await act(async () => {
    root.render(
      React.createElement(Harness, {
        ...commonProps,
        visualizationMethod: "raymarch",
        audioFeatureAuthorityRole:
          AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
        audioFeatureConfigurationVersion: 0,
      }),
    );
  });

  expect(featureRuntimeSpies.create).toHaveBeenCalledTimes(1);
  expect(featureRuntimeSpies.create).toHaveBeenCalledWith({}, { audioSession });
  expect(featureRuntimeSpies.setAuthorityRole).toHaveBeenCalledTimes(1);
  expect(featureRuntimeSpies.setAuthorityRole).toHaveBeenLastCalledWith(
    AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
  );
  expect(featureRuntimeSpies.start).toHaveBeenCalledTimes(1);
  expect(featureRuntimeSpies.configure).toHaveBeenCalledTimes(1);
  expect(
    featureRuntimeSpies.setAuthorityRole.mock.invocationCallOrder[0],
  ).toBeLessThan(featureRuntimeSpies.start.mock.invocationCallOrder[0]);
  expect(
    featureRuntimeSpies.configure.mock.invocationCallOrder[0],
  ).toBeLessThan(featureRuntimeSpies.start.mock.invocationCallOrder[0]);
  expect(featureRuntimeSpies.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
    }),
  );

  controlsRef.current = {
    ...controlsRef.current,
    boundaryMode: "dirichlet",
  };
  await act(async () => {
    root.render(
      React.createElement(Harness, {
        ...commonProps,
        visualizationMethod: "points",
        audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
        audioFeatureConfigurationVersion: 1,
      }),
    );
  });

  expect(featureRuntimeSpies.create).toHaveBeenCalledTimes(1);
  expect(featureRuntimeSpies.start).toHaveBeenCalledTimes(1);
  expect(featureRuntimeSpies.dispose).not.toHaveBeenCalled();
  expect(featureRuntimeSpies.setAuthorityRole).toHaveBeenCalledTimes(2);
  expect(featureRuntimeSpies.setAuthorityRole).toHaveBeenLastCalledWith(
    AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
  );
  expect(featureRuntimeSpies.configure).toHaveBeenCalledTimes(2);
  expect(featureRuntimeSpies.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({ boundaryMode: "dirichlet" }),
  );
  expect(visualizationSpies.create).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.setup).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.dispose).not.toHaveBeenCalled();

  const lifecycle = latestLifecycle;
  await act(async () => root.unmount());
  root = null;
  expect(featureRuntimeSpies.dispose).toHaveBeenCalledTimes(1);
  expect(lifecycle.runtimeRef.current).toBeNull();
  expect(lifecycle.runtimeStateRef.current).toBeNull();
  expect(lifecycle.audioFeatureRuntimeRef.current).toBeNull();
});

test("visualization runtime is created once per structural stage session", async () => {
  const audioRef = {
    current: {
      getStatus: () => ({ capacity: 16, fftSize: 8192, sampleRate: 48000 }),
    },
  };
  const controlsRef = {
    current: { volumeShape: "cube" },
  };
  const baryonGeometry = {};
  const commonProps = {
    audioRef,
    baryonGeometry,
    controlsRef,
    visualizationMethod: "raymarch",
    audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    audioFeatureConfigurationVersion: 0,
    setLiveInputRuntimeStatus: vi.fn(),
  };

  await act(async () => {
    root.render(
      React.createElement(Harness, {
        ...commonProps,
        setIsEngineReady: vi.fn(),
      }),
    );
  });

  expect(visualizationSpies.create).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.setup).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.setup).toHaveBeenCalledWith(
    expect.objectContaining({
      baryonGeometry: commonProps.baryonGeometry,
      parameters: expect.objectContaining({
        volumeShape: "cube",
      }),
    }),
  );

  await act(async () => {
    root.render(
      React.createElement(Harness, {
        ...commonProps,
        setIsEngineReady: vi.fn(),
      }),
    );
  });

  expect(visualizationSpies.create).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.setup).toHaveBeenCalledTimes(1);
  expect(visualizationSpies.dispose).not.toHaveBeenCalled();
});
