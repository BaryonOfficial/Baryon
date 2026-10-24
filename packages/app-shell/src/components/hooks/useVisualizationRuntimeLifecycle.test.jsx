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
  subscribeObservations: vi.fn(),
  unsubscribe: vi.fn(),
  readLatestFeatureModel: vi.fn(),
}));

const visualizationSpies = vi.hoisted(() => ({
  create: vi.fn(),
  setup: vi.fn(() => ({ points: [] })),
  dispose: vi.fn(),
  enqueueObservation: vi.fn(),
  revokeObservations: vi.fn(),
  invalidatePresentation: vi.fn(),
}));

vi.mock("@baryon/engine/visualization/runtime", () => ({
  createVisualizationRuntime: (...args) => {
    visualizationSpies.create(...args);
    return {
      method: "raymarch",
      setup: visualizationSpies.setup,
      dispose: visualizationSpies.dispose,
      enqueueObservation: visualizationSpies.enqueueObservation,
      revokeObservations: visualizationSpies.revokeObservations,
      invalidatePresentation: visualizationSpies.invalidatePresentation,
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
  featureRuntimeSpies.subscribeObservations.mockImplementation(
    () => featureRuntimeSpies.unsubscribe,
  );
  featureRuntimeSpies.readLatestFeatureModel.mockReset().mockReturnValue(null);
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

function ownedFeatureRuntime() {
  return {
    start: featureRuntimeSpies.start,
    configure: featureRuntimeSpies.configure,
    setAuthorityRole: featureRuntimeSpies.setAuthorityRole,
    dispose: featureRuntimeSpies.dispose,
    subscribeObservations: featureRuntimeSpies.subscribeObservations,
    readLatestFeatureModel: featureRuntimeSpies.readLatestFeatureModel,
  };
}

test("full Canvas replacement only resubscribes; it cannot construct, start, configure or dispose the audio owner", async () => {
  const owner = ownedFeatureRuntime();
  const props = {
    audioRef: {
      current: {
        featureRuntime: owner,
        getStatus: () => ({ sampleRate: 48000 }),
      },
    },
    controlsRef: { current: {} },
    baryonGeometry: {},
    setIsEngineReady: vi.fn(),
    setLiveInputRuntimeStatus: vi.fn(),
  };
  await act(async () => root.render(React.createElement(Harness, props)));
  const previous = latestLifecycle;
  expect(previous.featureSourceRef.current).toBe(owner);
  await act(async () => root.unmount());
  root = null;
  expect(previous.featureSourceRef.current).toBeNull();
  root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness, props)));
  expect(latestLifecycle.featureSourceRef.current).toBe(owner);
  expect(featureRuntimeSpies.subscribeObservations).toHaveBeenCalledTimes(2);
  expect(featureRuntimeSpies.unsubscribe).toHaveBeenCalledOnce();
  for (const key of [
    "create",
    "start",
    "configure",
    "setAuthorityRole",
    "dispose",
  ])
    expect(featureRuntimeSpies[key]).not.toHaveBeenCalled();
  expect(visualizationSpies.setup).toHaveBeenCalledTimes(2);
  expect(visualizationSpies.dispose).toHaveBeenCalledOnce();
});

test("visualization runtime is created once per structural stage session", async () => {
  const audioRef = {
    current: {
      featureRuntime: ownedFeatureRuntime(),
      getStatus: () => ({ sampleRate: 48000 }),
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

test("renderer subscriptions retain live observations and replay cache once without an audio bootstrap echo", async () => {
  const cached = { cached: true },
    live = { live: true };
  featureRuntimeSpies.readLatestFeatureModel.mockReturnValue(cached);
  const props = {
    audioRef: {
      current: {
        featureRuntime: ownedFeatureRuntime(),
        getStatus: () => ({ sampleRate: 48000 }),
      },
    },
    baryonGeometry: {},
    controlsRef: { current: {} },
    setIsEngineReady: vi.fn(),
    setLiveInputRuntimeStatus: vi.fn(),
  };
  await act(async () => root.render(React.createElement(Harness, props)));
  expect(props.setIsEngineReady).toHaveBeenLastCalledWith(true);
  expect(featureRuntimeSpies.subscribeObservations).toHaveBeenCalledOnce();
  expect(visualizationSpies.enqueueObservation).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ model: cached }),
  );
  const [onModel, onError] =
    featureRuntimeSpies.subscribeObservations.mock.calls[0];
  onModel(live);
  onError(new Error("observer overflow"));
  expect(visualizationSpies.enqueueObservation).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: live }),
  );
  expect(visualizationSpies.invalidatePresentation).toHaveBeenCalledOnce();
  expect(featureRuntimeSpies.create).not.toHaveBeenCalled();
  expect(featureRuntimeSpies.start).not.toHaveBeenCalled();
  await act(async () =>
    root.render(React.createElement(Harness, { ...props, baryonGeometry: {} })),
  );
  expect(featureRuntimeSpies.unsubscribe).toHaveBeenCalledOnce();
  expect(featureRuntimeSpies.subscribeObservations).toHaveBeenCalledTimes(2);
  expect(visualizationSpies.enqueueObservation).toHaveBeenCalledTimes(3);
  expect(featureRuntimeSpies.create).not.toHaveBeenCalled();
  expect(featureRuntimeSpies.start).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  root = null;
  expect(featureRuntimeSpies.unsubscribe).toHaveBeenCalledTimes(2);
});

test("a mirrored source supplies ordered GPU history and revocation without subscribing to or commanding local audio", async () => {
  const local = ownedFeatureRuntime(),
    unsubscribe = vi.fn(),
    requestRender = vi.fn();
  const subscribe = vi.fn(() => unsubscribe),
    current = { marker: "cached-mirror" };
  const mirror = {
    subscribeObservations: subscribe,
    readLatestFeatureModel: () => current,
  };
  await act(async () =>
    root.render(
      React.createElement(Harness, {
        audioRef: { current: { featureRuntime: local } },
        externalFeatureSource: mirror,
        requestRender,
        baryonGeometry: {},
        controlsRef: { current: {} },
        setIsEngineReady: vi.fn(),
        setLiveInputRuntimeStatus: vi.fn(),
      }),
    ),
  );
  expect(featureRuntimeSpies.subscribeObservations).not.toHaveBeenCalled();
  expect(visualizationSpies.enqueueObservation).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: current }),
  );
  const [offer, , revoke] = subscribe.mock.calls[0];
  const models = [{ marker: 1 }, { marker: 2 }, { marker: 3 }];
  await act(async () => {
    models.forEach(offer);
    revoke({ reason: "transport-lost" });
  });
  expect(
    visualizationSpies.enqueueObservation.mock.calls
      .slice(1)
      .map(([value]) => value.model),
  ).toEqual(models);
  expect(visualizationSpies.revokeObservations).toHaveBeenCalledOnce();
  expect(requestRender).toHaveBeenCalledOnce();
  expect(featureRuntimeSpies.start).not.toHaveBeenCalled();
  expect(featureRuntimeSpies.configure).not.toHaveBeenCalled();
  expect(featureRuntimeSpies.dispose).not.toHaveBeenCalled();
});
