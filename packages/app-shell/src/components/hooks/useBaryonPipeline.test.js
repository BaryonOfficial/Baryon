// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pipelineMocks = vi.hoisted(() => ({
  createFallbackRenderOutputPipeline: vi.fn(),
  createRenderOutputPipeline: vi.fn(),
  disposeRenderOutputPostNodes: vi.fn(),
  getRenderQualityProfileKey: vi.fn(
    (profile) => profile?.qualityPreset ?? "auto",
  ),
}));

vi.mock("@baryon/engine/render/outputPipeline", () => pipelineMocks);

import { useBaryonPipeline } from "./useBaryonPipeline.js";

const scene = { id: "scene" };
const camera = { id: "camera" };

function Harness({ gl, onValue, renderProfile }) {
  onValue(useBaryonPipeline(gl, scene, camera, renderProfile));
  return null;
}

describe("useBaryonPipeline", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    pipelineMocks.createFallbackRenderOutputPipeline.mockReset();
    pipelineMocks.createRenderOutputPipeline.mockReset();
    pipelineMocks.disposeRenderOutputPostNodes.mockClear();
    pipelineMocks.getRenderQualityProfileKey.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("owns one WebGPU pipeline for repeated renders of the same profile", async () => {
    const gl = { id: "renderer", backend: { isWebGLBackend: false } };
    const pipeline = { dispose: vi.fn() };
    const postNodes = { id: "post-nodes" };
    pipelineMocks.createRenderOutputPipeline.mockReturnValue({
      pipeline,
      postNodes,
    });
    let owner;

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          gl,
          renderProfile: { qualityPreset: "auto" },
          onValue: (value) => {
            owner = value;
          },
        }),
      );
    });

    expect(owner.ensurePipeline()).toBe(pipeline);
    expect(owner.ensurePipeline()).toBe(pipeline);
    expect(pipelineMocks.createRenderOutputPipeline).toHaveBeenCalledOnce();
    expect(
      pipelineMocks.createFallbackRenderOutputPipeline,
    ).not.toHaveBeenCalled();
    expect(owner.postNodesRef.current).toBe(postNodes);
  });

  it("replaces the owned pipeline only when the render profile changes", async () => {
    const gl = { id: "renderer", backend: { isWebGLBackend: false } };
    const firstPipeline = { dispose: vi.fn() };
    const secondPipeline = { dispose: vi.fn() };
    const firstPostNodes = { id: "first-post-nodes" };
    const secondPostNodes = { id: "second-post-nodes" };
    pipelineMocks.createRenderOutputPipeline
      .mockReturnValueOnce({
        pipeline: firstPipeline,
        postNodes: firstPostNodes,
      })
      .mockReturnValueOnce({
        pipeline: secondPipeline,
        postNodes: secondPostNodes,
      });
    let owner;
    const onValue = (value) => {
      owner = value;
    };

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          gl,
          renderProfile: { qualityPreset: "auto" },
          onValue,
        }),
      );
    });
    expect(owner.ensurePipeline()).toBe(firstPipeline);

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          gl,
          renderProfile: { qualityPreset: "max-quality" },
          onValue,
        }),
      );
    });

    expect(owner.ensurePipeline()).toBe(secondPipeline);
    expect(firstPipeline.dispose).toHaveBeenCalledOnce();
    expect(pipelineMocks.disposeRenderOutputPostNodes).toHaveBeenCalledWith(
      firstPostNodes,
    );
    expect(pipelineMocks.createRenderOutputPipeline).toHaveBeenCalledTimes(2);
    expect(owner.postNodesRef.current).toBe(secondPostNodes);
  });

  it("uses only the fallback owner on WebGL", async () => {
    const gl = { id: "renderer", backend: { isWebGLBackend: true } };
    const pipeline = { dispose: vi.fn() };
    pipelineMocks.createFallbackRenderOutputPipeline.mockReturnValue({
      pipeline,
      postNodes: null,
    });
    let owner;

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          gl,
          renderProfile: { qualityPreset: "auto" },
          onValue: (value) => {
            owner = value;
          },
        }),
      );
    });

    expect(owner.ensurePipeline()).toBe(pipeline);
    expect(
      pipelineMocks.createFallbackRenderOutputPipeline,
    ).toHaveBeenCalledOnce();
    expect(pipelineMocks.createRenderOutputPipeline).not.toHaveBeenCalled();
  });
});
