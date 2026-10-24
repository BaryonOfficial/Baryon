// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useAudioFeatureOwner } from "./useAudioFeatureOwner.js";
import { dispatchControlsChanged } from "../../controls/controlsEvents.js";
let root, element;
const runtime = {
  configure: vi.fn(),
  setAuthorityRole: vi.fn(),
  start: vi.fn(),
  dispose: vi.fn(),
};
function Host(props) {
  useAudioFeatureOwner(props);
  return props.children ?? null;
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  element.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
test("a headless host applies explicit source commands; render children, cache data and unmount cannot start/dispose it", async () => {
  const props = {
    audioSession: { featureRuntime: runtime },
    controlsRef: { current: { boundaryMode: "neumann" } },
    authorityRole: "local-producer",
  };
  await act(async () => root.render(<Host {...props} />));
  expect(runtime.configure).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ boundaryMode: "neumann" }),
  );
  expect(runtime.setAuthorityRole).toHaveBeenCalledExactlyOnceWith(
    "local-producer",
  );
  await act(async () =>
    root.render(
      <Host {...props}>
        <div>replacement renderer</div>
      </Host>,
    ),
  );
  expect(runtime.configure).toHaveBeenCalledOnce();
  await act(async () => dispatchControlsChanged({ boundaryMode: "dirichlet" }));
  expect(runtime.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({ boundaryMode: "dirichlet" }),
  );
  await act(async () => root.unmount());
  root = null;
  expect(runtime.start).not.toHaveBeenCalled();
  expect(runtime.dispose).not.toHaveBeenCalled();
});
test("consumer controls and telemetry cannot configure a physical source; producer transition applies apparatus before activation", async () => {
  const props = {
    audioSession: { featureRuntime: runtime },
    controlsRef: { current: { boundaryMode: "dirichlet" } },
    authorityRole: "external-consumer",
  };
  await act(async () => root.render(<Host {...props} />));
  await act(async () => dispatchControlsChanged({ boundaryMode: "neumann" }));
  expect(runtime.configure).not.toHaveBeenCalled();
  expect(runtime.setAuthorityRole).toHaveBeenCalledExactlyOnceWith(
    "external-consumer",
  );
  await act(async () =>
    root.render(<Host {...props} configurationVersion={2} />),
  );
  expect(runtime.configure).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <Host
        {...props}
        authorityRole="local-producer"
        configurationVersion={2}
      />,
    ),
  );
  expect(runtime.configure).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ boundaryMode: "dirichlet" }),
  );
  expect(runtime.configure.mock.invocationCallOrder[0]).toBeLessThan(
    runtime.setAuthorityRole.mock.invocationCallOrder.at(-1),
  );
  expect(runtime.start).not.toHaveBeenCalled();
  expect(runtime.dispose).not.toHaveBeenCalled();
});
test("the headless source exports accepted observations and current material without a Canvas or renderer revision", async () => {
  const { createAudioFeaturePacketFixture } =
    await import("../../../../engine/src/testing/audioFeaturePacketFixture.js");
  const source = createAudioFeaturePacketFixture(),
    model = source.model();
  const readLatestFeatureModel = vi.fn(() => model),
    register = vi.fn();
  const owner = { ...runtime, readLatestFeatureModel };
  const controlsRef = {
    current: {
      colorMode: "spectral",
      volumeColor: "#123456",
      surfaceColor: "#abcdef",
      spectralChroma: 0.7,
    },
  };
  await act(async () =>
    root.render(
      <Host
        audioSession={{ featureRuntime: owner }}
        controlsRef={controlsRef}
        registerStructureExportSampleReader={register}
      />,
    ),
  );
  const reader = register.mock.calls.at(-1)[0];
  const sample = reader();
  expect(sample.featureFrame.observation).toBe(model.observation);
  expect(sample.materialControls).toEqual({
    colorMode: "spectral",
    volumeColorRgb: "#123456",
    surfaceColorRgb: "#abcdef",
    spectralChroma: 0.7,
  });
  controlsRef.current = { ...controlsRef.current, surfaceColor: "#000000" };
  expect(reader().materialControls.surfaceColorRgb).toBe("#000000");
  readLatestFeatureModel.mockReturnValue(null);
  expect(reader()).toBeNull();
  await act(async () => root.unmount());
  root = null;
  expect(register).toHaveBeenLastCalledWith(null);
  expect(runtime.start).not.toHaveBeenCalled();
  expect(runtime.dispose).not.toHaveBeenCalled();
});
