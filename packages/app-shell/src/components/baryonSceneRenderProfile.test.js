import { expect, test } from "vitest";
import { RENDER_CONTEXTS } from "@baryon/visualizer/render/outputPipeline";
import {
  resolveSceneRenderQualityProfile,
  shouldAllowLocalRenderProfileCommands,
} from "./baryonSceneRenderProfile.js";

test("preview scenes keep the local render-profile command path", () => {
  expect(shouldAllowLocalRenderProfileCommands(RENDER_CONTEXTS.preview)).toBe(
    true,
  );
});

test("authoritative external-output ignores local render-profile command overrides", () => {
  const profile = resolveSceneRenderQualityProfile({
    performanceProfile: "custom",
    renderContext: RENDER_CONTEXTS.externalOutput,
    resolvedRenderProfile: {
      qualityPreset: "custom",
      targetFps: 120,
      renderScale: 0.67,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
    syncedRenderProfileOverrides: {
      traaEnabled: false,
    },
    localRenderProfileOverrides: {
      renderScale: 0.92,
      traaEnabled: true,
    },
  });

  expect(profile).toMatchObject({
    qualityPreset: "custom",
    targetFps: 120,
    renderScale: 0.67,
    traaEnabled: true,
    renderContext: RENDER_CONTEXTS.externalOutput,
  });
});

test("preview scenes still honor local render-profile command overrides", () => {
  const profile = resolveSceneRenderQualityProfile({
    performanceProfile: "auto",
    renderContext: RENDER_CONTEXTS.preview,
    outputWidth: 1920,
    outputHeight: 1080,
    localRenderProfileOverrides: {
      renderScale: 0.5,
      traaEnabled: false,
    },
  });

  expect(profile).toMatchObject({
    qualityPreset: "auto",
    renderScale: 0.5,
    traaEnabled: true,
    renderContext: RENDER_CONTEXTS.preview,
  });
});
