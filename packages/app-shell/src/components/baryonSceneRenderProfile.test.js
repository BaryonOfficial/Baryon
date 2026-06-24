import { expect, test } from "vitest";
import { RENDER_CONTEXTS } from "@baryon/engine/render/outputPipeline";
import {
  resolveSceneRenderPerformanceProfile,
  sanitizeLocalPostProcessOverrides,
  shouldAllowLocalPostProcessOverrides,
} from "./baryonSceneRenderProfile.js";

test("preview scenes allow local post-process override commands", () => {
  expect(shouldAllowLocalPostProcessOverrides(RENDER_CONTEXTS.preview)).toBe(
    true,
  );
});

test("local post-process overrides keep only supported fields", () => {
  expect(
    sanitizeLocalPostProcessOverrides({
      renderScale: 0.5,
      traaEnabled: false,
      bloomAllowed: false,
      unexpected: true,
    }),
  ).toEqual({
    traaEnabled: false,
    bloomAllowed: false,
  });

  expect(
    sanitizeLocalPostProcessOverrides({
      renderScale: 0,
      traaEnabled: "nope",
      bloomAllowed: null,
    }),
  ).toBeNull();
});

test("authoritative external-output uses the resolved profile with diagnostics TRAA override", () => {
  const profile = resolveSceneRenderPerformanceProfile({
    performanceProfile: "custom",
    renderContext: RENDER_CONTEXTS.externalOutput,
    resolvedRenderProfile: {
      qualityPreset: "custom",
      targetFps: 120,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
    localPostProcessOverrides: {
      renderScale: 0.92,
    },
    traaEnabled: false,
  });

  expect(profile).toMatchObject({
    qualityPreset: "custom",
    targetFps: 120,
    traaEnabled: false,
    bloomAllowed: true,
    renderContext: RENDER_CONTEXTS.externalOutput,
  });
  expect(profile).not.toHaveProperty("renderScale");
});

test("preview scenes honor local diagnostics overrides without downscaling", () => {
  const profile = resolveSceneRenderPerformanceProfile({
    performanceProfile: "auto",
    renderContext: RENDER_CONTEXTS.preview,
    outputWidth: 1920,
    outputHeight: 1080,
    localPostProcessOverrides: {
      renderScale: 0.5,
    },
    traaEnabled: false,
  });

  expect(profile).toMatchObject({
    qualityPreset: "auto",
    traaEnabled: false,
    renderContext: RENDER_CONTEXTS.preview,
  });
  expect(profile).not.toHaveProperty("renderScale");
});

test("preview custom profiles use the custom target FPS without downscaling", () => {
  const profile = resolveSceneRenderPerformanceProfile({
    performanceProfile: "custom",
    targetFps: 72,
    renderContext: RENDER_CONTEXTS.preview,
    outputWidth: 1920,
    outputHeight: 1080,
    localPostProcessOverrides: {
      renderScale: 0.5,
    },
  });

  expect(profile).toMatchObject({
    qualityPreset: "custom",
    targetFps: 72,
    renderContext: RENDER_CONTEXTS.preview,
  });
  expect(profile).not.toHaveProperty("renderScale");
});
