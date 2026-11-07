import * as THREE from "three";
import { expect, test, vi } from "vitest";
import { createControlState } from "@baryon/engine/controls/schema";
import {
  applyBloomControls,
  applyOutputControls,
} from "@baryon/engine/controls/runtime";
import { applyCachedControlSnapshots } from "./baryonEngineRenderLoop.js";
import { createEmptyControlSnapshots } from "./baryonEngineRuntimeState.js";

function createPostNodes(hasBloomPass = true) {
  return {
    outputUniforms: { backgroundColor: { value: new THREE.Color("#000000") } },
    bloomUniforms: { enabled: { value: 0 } },
    bloomPass: hasBloomPass
      ? {
          strength: { value: 0 },
          radius: { value: 0 },
          threshold: { value: 0 },
        }
      : null,
  };
}

function createHarness(postNodes = createPostNodes()) {
  const controls = {
    ...createControlState(),
    outputBackgroundColor: "#65829d",
    bloomEnabled: true,
    bloomStrength: 0.9,
    bloomRadius: 0.3,
    bloomThreshold: 0.2,
    raymarchSteps: 96,
  };
  const pipeline = {};
  const args = {
    controls,
    runtimeState: {},
    gl: {},
    ensurePipeline: vi.fn(() => pipeline),
    postNodesRef: { current: postNodes },
    renderProfileRef: {
      current: { renderContext: "external-output", bloomAllowed: true },
    },
    renderLoopRefs: {
      controlCacheRefs: {
        controlVersionRef: { current: 7 },
        appliedControlVersionRef: { current: -1 },
        cachedControlSnapshotsRef: {
          current: createEmptyControlSnapshots(controls),
        },
      },
    },
  };
  const appliers = {
    applySharedControls: vi.fn(() => ({})),
    applyOutputControls: vi.fn(applyOutputControls),
    applyRaymarchControls: vi.fn(() => ({})),
    applyBloomControls: vi.fn(applyBloomControls),
  };
  return { args, appliers };
}

function expectAppliedSettings(postNodes) {
  expect(postNodes.outputUniforms.backgroundColor.value.getHexString()).toBe(
    "65829d",
  );
  expect(postNodes.bloomUniforms.enabled.value).toBe(1);
  if (postNodes.bloomPass) {
    expect(postNodes.bloomPass.strength.value).toBe(0.9);
    expect(postNodes.bloomPass.radius.value).toBe(0.3);
    expect(postNodes.bloomPass.threshold.value).toBe(0.2);
  }
}

test.each([true, false])(
  "restores unchanged settings once when effects objects are replaced (bloom present: %s)",
  (hasBloomPass) => {
    const { args, appliers } = createHarness(createPostNodes(hasBloomPass));
    const first = applyCachedControlSnapshots(args, appliers);
    expect(first.controlsChanged).toBe(true);
    expectAppliedSettings(args.postNodesRef.current);

    const replacement = createPostNodes(hasBloomPass);
    args.postNodesRef.current = replacement;
    const restored = applyCachedControlSnapshots(args, appliers);
    expect(restored.controlsChanged).toBe(true);
    expectAppliedSettings(replacement);

    for (let frame = 0; frame < 20; frame += 1) {
      const stable = applyCachedControlSnapshots(args, appliers);
      expect(stable.controlsChanged).toBe(false);
      expect(stable.output).toBe(restored.output);
    }
    for (const applier of Object.values(appliers)) {
      expect(applier).toHaveBeenCalledTimes(2);
    }
    const refs = args.renderLoopRefs.controlCacheRefs;
    expect(refs.controlVersionRef.current).toBe(7);
    expect(refs.appliedControlVersionRef.current).toBe(7);
    expect(refs.cachedControlSnapshotsRef.current.controlsSnapshot).toBe(
      args.controls,
    );
  },
);

test("records the effects objects created during initial control application", () => {
  const { args, appliers } = createHarness(null);
  const created = createPostNodes();
  args.ensurePipeline.mockImplementation(() => {
    args.postNodesRef.current = created;
    return {};
  });

  applyCachedControlSnapshots(args, appliers);
  expectAppliedSettings(created);
  expect(applyCachedControlSnapshots(args, appliers).controlsChanged).toBe(
    false,
  );
  for (const applier of Object.values(appliers)) {
    expect(applier).toHaveBeenCalledOnce();
  }
});

test("retains settings through a pipeline-free interval and restores them when effects return", () => {
  const { args, appliers } = createHarness();
  applyCachedControlSnapshots(args, appliers);
  args.postNodesRef.current = null;
  args.ensurePipeline.mockReturnValue(null);
  applyCachedControlSnapshots(args, appliers);
  expect(applyCachedControlSnapshots(args, appliers).controlsChanged).toBe(
    false,
  );

  args.postNodesRef.current = createPostNodes();
  args.ensurePipeline.mockReturnValue({});
  expect(applyCachedControlSnapshots(args, appliers).controlsChanged).toBe(
    true,
  );
  expectAppliedSettings(args.postNodesRef.current);
  expect(args.renderLoopRefs.controlCacheRefs.controlVersionRef.current).toBe(
    7,
  );
});

test("still applies control revisions and surface output mode changes to the same effects objects", () => {
  const { args, appliers } = createHarness();
  applyCachedControlSnapshots(args, appliers);
  args.controls.outputBackgroundColor = "#123456";
  args.renderLoopRefs.controlCacheRefs.controlVersionRef.current += 1;
  expect(applyCachedControlSnapshots(args, appliers).controlsChanged).toBe(
    true,
  );
  expect(
    args.postNodesRef.current.outputUniforms.backgroundColor.value.getHexString(),
  ).toBe("123456");
  args.surfaceOutputMode = "transparent";
  const transparent = applyCachedControlSnapshots(args, appliers);
  expect(transparent.controlsChanged).toBe(true);
  expect(transparent.output.outputMode).toBe("transparent");
  expect(applyCachedControlSnapshots(args, appliers).controlsChanged).toBe(
    false,
  );
});
