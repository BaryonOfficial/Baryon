import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const PRODUCTION_WIDTH = 1920;
const PRODUCTION_HEIGHT = 1080;
const PRODUCTION_RAYMARCH_STEPS = 80;
const REFERENCE_RAYMARCH_STEPS = 104;
const ACTIVE_LUMINANCE_THRESHOLD = 0.004;

async function installProductionControlMirror(page) {
  await page.addInitScript(() => {
    window.__baryonEngineAcceptanceControls = null;
    window.addEventListener("__baryon-controls-change", (event) => {
      window.__baryonEngineAcceptanceControls = { ...(event.detail ?? {}) };
    });
  });
}

async function setProductionControls(page, entries) {
  await page.evaluate(async (mutations) => {
    for (const [key, value] of mutations) {
      window.dispatchEvent(
        new CustomEvent("__baryon-controls-command", {
          detail: { key, value, persistMode: "none" },
        }),
      );
    }
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, entries);

  const expected = Object.fromEntries(entries);
  await expect
    .poll(
      () =>
        page.evaluate((controlState) => {
          const applied = window.__baryonEngineAcceptanceControls ?? {};
          return Object.entries(controlState).every(([key, value]) =>
            Object.is(applied[key], value),
          );
        }, expected),
      { timeout: 15_000 },
    )
    .toBe(true);
}

function summarize(values) {
  if (values.length === 0) {
    return { average: 0, p95: 0 };
  }
  const ordered = [...values].sort((left, right) => left - right);
  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    p95: ordered[
      Math.min(ordered.length - 1, Math.ceil(values.length * 0.95) - 1)
    ],
  };
}

async function sampleFrameIntervals(page, durationMs = 2_500) {
  const sample = await page.evaluate(
    (targetDurationMs) =>
      new Promise((resolve) => {
        const intervals = [];
        let startedAt = null;
        let previousAt = null;
        const sampleFrame = (timestamp) => {
          if (startedAt == null) {
            startedAt = timestamp;
            previousAt = timestamp;
          } else {
            intervals.push(timestamp - previousAt);
            previousAt = timestamp;
          }
          if (timestamp - startedAt >= targetDurationMs) {
            resolve({
              durationMs: timestamp - startedAt,
              intervals,
              perfMetrics: window.__baryonPerfMetrics ?? null,
            });
            return;
          }
          window.requestAnimationFrame(sampleFrame);
        };
        window.requestAnimationFrame(sampleFrame);
      }),
    durationMs,
  );
  const frameTimes = summarize(sample.intervals);
  return {
    durationMs: sample.durationMs,
    frameCount: sample.intervals.length,
    countedFps: sample.intervals.length / (sample.durationMs / 1000),
    averageFrameTimeMs: frameTimes.average,
    p95FrameTimeMs: frameTimes.p95,
    framesOver25Ms: sample.intervals.filter((value) => value > 25).length,
    perfMetrics: sample.perfMetrics,
  };
}

async function captureCanvasEvidence(page, artifactPath) {
  const canvas = page.locator("#root > div canvas").first();
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Production canvas has no measurable bounds.");
  }
  const screenshot = await canvas.screenshot({ path: artifactPath });
  const uiOnly = await page.screenshot({
    clip: canvasBox,
    style: "#root canvas { visibility: hidden !important; }",
  });
  const { data, info } = await sharp(screenshot)
    .resize({ width: 320, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: uiData } = await sharp(uiOnly)
    .resize(info.width, info.height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const luminance = new Float64Array(info.width * info.height);
  let activePixelCount = 0;
  let chromaticPixelCount = 0;
  let activeSaturationTotal = 0;
  for (let pixelIndex = 0; pixelIndex < luminance.length; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const uiLuminance =
      (0.2126 * uiData[offset] +
        0.7152 * uiData[offset + 1] +
        0.0722 * uiData[offset + 2]) /
      255;
    if (uiLuminance > 0.002) {
      continue;
    }
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminance[pixelIndex] = value;
    if (value <= ACTIVE_LUMINANCE_THRESHOLD) {
      continue;
    }
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
    activePixelCount += 1;
    activeSaturationTotal += saturation;
    if (saturation >= 0.18 && maximum >= 0.055) {
      chromaticPixelCount += 1;
    }
  }

  let gradientTotal = 0;
  let gradientCount = 0;
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = y * info.width + x;
      const horizontal = (luminance[index + 1] - luminance[index - 1]) * 0.5;
      const vertical =
        (luminance[index + info.width] - luminance[index - info.width]) * 0.5;
      gradientTotal += Math.hypot(horizontal, vertical);
      gradientCount += 1;
    }
  }

  const meanLuminance =
    luminance.reduce((total, value) => total + value, 0) /
    Math.max(1, luminance.length);
  const luminanceVariance =
    luminance.reduce(
      (total, value) => total + (value - meanLuminance) ** 2,
      0,
    ) / Math.max(1, luminance.length);

  return {
    width: info.width,
    height: info.height,
    activePixelRatio: activePixelCount / luminance.length,
    chromaticPixelRatio: chromaticPixelCount / luminance.length,
    activeMeanSaturation:
      activePixelCount > 0 ? activeSaturationTotal / activePixelCount : 0,
    meanLuminance,
    luminanceStdDev: Math.sqrt(luminanceVariance),
    gradientMean: gradientTotal / Math.max(1, gradientCount),
  };
}

async function waitForRaymarchStepCount(page, stepCount) {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          requested:
            window.__baryonPerfMetrics?.render?.requestedRaymarchSteps ?? 0,
          effective:
            window.__baryonPerfMetrics?.render?.effectiveRaymarchSteps ?? 0,
        })),
      { timeout: 30_000 },
    )
    .toEqual({ requested: stepCount, effective: stepCount });
}

test("production WebGPU preserves authority, spectral output, 80-step fidelity, and performance evidence", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium", "WebGPU acceptance is chromium-only");
  await page.setViewportSize({
    width: PRODUCTION_WIDTH,
    height: PRODUCTION_HEIGHT,
  });
  await installProductionControlMirror(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect
    .poll(() => page.evaluate(() => window.__baryonRendererInfo ?? null), {
      timeout: 30_000,
    })
    .toMatchObject({
      backendType: "webgpu",
      backend: expect.any(String),
      isFallback: false,
      error: null,
      gpuErrors: [],
    });

  await setProductionControls(page, [
    ["auditEnabled", true],
    ["performanceHudEnabled", false],
    ["renderQualityPreset", "max-quality"],
    ["raymarchSteps", REFERENCE_RAYMARCH_STEPS],
    ["colorMode", "spectral"],
    ["spectralChroma", 1],
    ["bloomEnabled", true],
    ["traaEnabled", true],
    ["smaaEnabled", true],
    ["injectTestTone", true],
    ["testToneHz", 528],
    ["testToneAmplitude", 0.5],
  ]);

  await waitForRaymarchStepCount(page, REFERENCE_RAYMARCH_STEPS);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const metrics = window.__baryonPerfMetrics;
          const probe = metrics?.render?.renderProbeSnapshot;
          return {
            authority: probe?.state?.renderAuthority ?? false,
            activeCandidate: probe?.health?.activeCandidate ?? false,
            spectral: probe?.state?.spectralPresentationEnabled ?? false,
            visible: metrics?.render?.materialOutputVisible ?? false,
            hasActiveModes:
              (metrics?.modalFreshness?.activeModalFieldModeCount ?? 0) > 0,
          };
        }),
      { timeout: 30_000 },
    )
    .toMatchObject({
      authority: true,
      activeCandidate: true,
      spectral: true,
      visible: true,
      hasActiveModes: true,
    });

  const referenceImagePath = testInfo.outputPath(
    "webgpu-104-step-reference.png",
  );
  const referenceVisual = await captureCanvasEvidence(page, referenceImagePath);

  await setProductionControls(page, [
    ["raymarchSteps", PRODUCTION_RAYMARCH_STEPS],
  ]);
  await waitForRaymarchStepCount(page, PRODUCTION_RAYMARCH_STEPS);
  await page.waitForTimeout(1_000);

  const productionImagePath = testInfo.outputPath(
    "webgpu-80-step-production.png",
  );
  const productionVisual = await captureCanvasEvidence(
    page,
    productionImagePath,
  );
  const performance = await sampleFrameIntervals(page);
  const activeState = await page.evaluate(() => ({
    renderer: window.__baryonRendererInfo ?? null,
    render: window.__baryonPerfMetrics?.render ?? null,
    renderSurface: window.__baryonPerfMetrics?.renderSurface ?? null,
    renderProbe:
      window.__baryonPerfMetrics?.render?.renderProbeSnapshot ?? null,
    modalFreshness: window.__baryonPerfMetrics?.modalFreshness ?? null,
    engine: window.__baryonPerfMetrics?.engine ?? null,
  }));

  expect(activeState.renderSurface).toMatchObject({
    backingWidth: PRODUCTION_WIDTH,
    backingHeight: PRODUCTION_HEIGHT,
  });
  expect(activeState.render).toMatchObject({
    requestedRaymarchSteps: PRODUCTION_RAYMARCH_STEPS,
    effectiveRaymarchSteps: PRODUCTION_RAYMARCH_STEPS,
    adaptiveRaymarchActive: false,
    spectralPresentationEnabled: true,
    materialOutputVisible: true,
  });
  expect(productionVisual.activePixelRatio).toBeGreaterThan(0.01);
  expect(productionVisual.chromaticPixelRatio).toBeGreaterThan(0.005);
  expect(productionVisual.activeMeanSaturation).toBeGreaterThan(0.2);
  expect(
    Math.abs(
      productionVisual.activePixelRatio - referenceVisual.activePixelRatio,
    ),
  ).toBeLessThanOrEqual(0.05);
  expect(
    Math.abs(
      productionVisual.luminanceStdDev - referenceVisual.luminanceStdDev,
    ),
  ).toBeLessThanOrEqual(0.04);
  expect(
    Math.abs(productionVisual.gradientMean - referenceVisual.gradientMean),
  ).toBeLessThanOrEqual(0.03);
  await setProductionControls(page, [["injectTestTone", false]]);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const metrics = window.__baryonPerfMetrics;
          const probe = metrics?.render?.renderProbeSnapshot;
          return {
            authority: probe?.state?.renderAuthority ?? true,
            activeCandidate: probe?.health?.activeCandidate ?? true,
            materialOutputVisible:
              metrics?.render?.materialOutputVisible ?? true,
          };
        }),
      { timeout: 30_000 },
    )
    .toEqual({
      authority: false,
      activeCandidate: false,
      materialOutputVisible: false,
    });

  const stableRevocation = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const startedAt = performance.now();
        const initialFrameId =
          window.__baryonPerfMetrics?.engine?.latestAcceptedFrameId ?? 0;
        let sampleCount = 0;
        let authorityObserved = false;
        let materialOutputObserved = false;
        const sample = (timestamp) => {
          const metrics = window.__baryonPerfMetrics;
          authorityObserved ||=
            metrics?.render?.renderProbeSnapshot?.state?.renderAuthority ===
            true;
          materialOutputObserved ||=
            metrics?.render?.materialOutputVisible === true;
          sampleCount += 1;
          if (timestamp - startedAt >= 1_000) {
            resolve({
              sampleCount,
              authorityObserved,
              materialOutputObserved,
              acceptedFrameAdvanced:
                (metrics?.engine?.latestAcceptedFrameId ?? 0) > initialFrameId,
            });
            return;
          }
          window.requestAnimationFrame(sample);
        };
        window.requestAnimationFrame(sample);
      }),
  );
  expect(stableRevocation.sampleCount).toBeGreaterThan(0);
  expect(stableRevocation.acceptedFrameAdvanced).toBe(true);
  expect(stableRevocation.authorityObserved).toBe(false);
  expect(stableRevocation.materialOutputObserved).toBe(false);

  const evidence = {
    target: {
      width: PRODUCTION_WIDTH,
      height: PRODUCTION_HEIGHT,
      raymarchSteps: PRODUCTION_RAYMARCH_STEPS,
    },
    reference: {
      raymarchSteps: REFERENCE_RAYMARCH_STEPS,
      visual: referenceVisual,
    },
    production: {
      visual: productionVisual,
      performance,
      activeState,
      stableRevocation,
    },
  };
  // Frame rates depend on the installed adapter and runner load. This lane
  // preserves the exact target-resolution tail evidence instead of silently
  // normalizing it into a machine-independent pass condition. Certified
  // hardware can impose its own SLA on this artifact.
  expect(performance.frameCount).toBeGreaterThan(0);
  expect(Number.isFinite(performance.countedFps)).toBe(true);
  expect(Number.isFinite(performance.p95FrameTimeMs)).toBe(true);
  console.log("engine-webgpu-acceptance", {
    countedFps: performance.countedFps,
    averageFrameTimeMs: performance.averageFrameTimeMs,
    p95FrameTimeMs: performance.p95FrameTimeMs,
    framesOver25Ms: performance.framesOver25Ms,
    productionVisual,
    referenceVisual,
  });
  await testInfo.attach("engine-webgpu-acceptance-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach("webgpu-104-step-reference", {
    path: referenceImagePath,
    contentType: "image/png",
  });
  await testInfo.attach("webgpu-80-step-production", {
    path: productionImagePath,
    contentType: "image/png",
  });
});
