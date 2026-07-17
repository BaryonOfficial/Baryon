import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { evaluateStraightSceneLinearHeadroom } from "../../../packages/engine/src/render/displayRadiance.js";

const ACTIVE_LUMINANCE_THRESHOLD = 0.004;
const ACTIVE_GRADIENT_HOTSPOT_THRESHOLD = 0.12;
const HUE_FAMILY_COUNT = 8;
const OPTICAL_MEASUREMENT_CONTROLS = Object.freeze({
  raymarchSteps: 104,
  densityGain: 3.08,
  holographicIntensity: 0.52,
  holographicFresnelPower: 4.8,
  bloomEnabled: false,
  bloomStrength: 0.63536,
  bloomRadius: 0,
  bloomThreshold: 0.542,
  colorMode: "spectral",
  spectralMix: 0.92,
});
const DENSE_POLYPHONIC_FIXTURE = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/engine/src/utils/audio/fixtures/dense-polyphonic-12s.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function createDensePolyphonicFixtureWavBuffer({
  sampleRate = 44100,
  amplitude = 0.82,
} = {}) {
  const durationSeconds = DENSE_POLYPHONIC_FIXTURE.durationMs / 1000;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const channelCount = 1;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  const writeAscii = (offset, value) => {
    bytes.set(encoder.encode(value), offset);
  };
  const fixtureFrames = DENSE_POLYPHONIC_FIXTURE.frames;

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let rightIndex = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = (index / sampleRate) * 1000;
    while (
      rightIndex < fixtureFrames.length - 1 &&
      fixtureFrames[rightIndex].frameTimeMs < timeMs
    ) {
      rightIndex += 1;
    }
    const rightFrame =
      fixtureFrames[Math.min(rightIndex, fixtureFrames.length - 1)];
    const leftFrame = fixtureFrames[Math.max(0, rightIndex - 1)] ?? rightFrame;
    const range = Math.max(
      1,
      (rightFrame?.frameTimeMs ?? 0) - (leftFrame?.frameTimeMs ?? 0),
    );
    const mix =
      rightFrame === leftFrame
        ? 0
        : Math.max(0, Math.min(1, (timeMs - leftFrame.frameTimeMs) / range));
    const leftData = leftFrame.analysisSnapshot.timeData;
    const rightData = rightFrame.analysisSnapshot.timeData;
    const position = index % Math.min(leftData.length, rightData.length);
    const value = leftData[position] * (1 - mix) + rightData[position] * mix;
    const normalized = Math.max(
      -1,
      Math.min(1, ((value - 128) / 128) * amplitude),
    );
    view.setInt16(
      44 + index * bytesPerSample,
      Math.round(normalized * 0x7fff),
      true,
    );
  }

  return Buffer.from(buffer);
}

async function waitForControlSurface(page) {
  await page.waitForFunction(() => window.__baryonTestReady === true);
}

async function setControl(page, key, value) {
  await page.evaluate(
    ([controlKey, controlValue]) => {
      window.__baryonControls.setControl(controlKey, controlValue);
    },
    [key, value],
  );
}

async function applyOpticalMeasurementControls(page) {
  for (const [key, value] of Object.entries(OPTICAL_MEASUREMENT_CONTROLS)) {
    await setControl(page, key, value);
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = window.__baryonControls?.getState?.() ?? {};
        return {
          colorMode: controls.colorMode ?? null,
          raymarchSteps: controls.raymarchSteps ?? null,
        };
      }),
    )
    .toEqual({
      colorMode: OPTICAL_MEASUREMENT_CONTROLS.colorMode,
      raymarchSteps: OPTICAL_MEASUREMENT_CONTROLS.raymarchSteps,
    });
}

async function readCanvasLuminanceMetrics(page, artifactPath = null) {
  const canvas = page.locator("#root > div canvas").first();
  await expect(canvas).toBeVisible();
  const screenshotPng = await canvas.screenshot();
  // Mask DOM UI composited over the canvas region; otherwise chrome pixels
  // dominate the luminance percentiles and an empty field can pass (or a
  // silent field can fail) purely on interface brightness. The UI-only pass
  // hides the canvas and captures the same clipped region.
  const canvasBox = await canvas.boundingBox();
  const uiOnlyPng = await page.screenshot({
    clip: canvasBox,
    style: "#root canvas { visibility: hidden !important; }",
  });
  const {
    data,
    info: { width, height },
  } = await sharp(screenshotPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: uiData } = await sharp(uiOnlyPng)
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampleStride = Math.max(1, Math.floor(Math.min(width, height) / 256));
  const luminance = [];
  let nonblackCount = 0;
  let negativeSpaceCount = 0;
  let broadWashCount = 0;
  let brightPlateCount = 0;
  let nearWhiteCount = 0;
  let brightLowSaturationCount = 0;
  let centralSampleCount = 0;
  let chromaticPixelCount = 0;
  let activeSaturationTotal = 0;
  let activeChromaTotal = 0;
  const hueFamilyCounts = new Array(HUE_FAMILY_COUNT).fill(0);
  const gridValues = [];
  const centralNonblack = [];
  let gridWidth = 0;
  let gridHeight = 0;

  for (let y = 0; y < height; y += sampleStride) {
    let rowWidth = 0;
    for (let x = 0; x < width; x += sampleStride) {
      const index = (y * width + x) * 4;
      // Interface pixels are masked to darkness so only canvas content can
      // satisfy (or fail) the luminance gates.
      const uiMasked =
        (0.2126 * uiData[index] +
          0.7152 * uiData[index + 1] +
          0.0722 * uiData[index + 2]) /
          255 >
        0.002;
      const alpha = uiMasked ? 0 : data[index + 3] / 255;
      const value =
        ((0.2126 * data[index] +
          0.7152 * data[index + 1] +
          0.0722 * data[index + 2]) /
          255) *
        alpha;
      const maxChannel = Math.max(
        data[index],
        data[index + 1],
        data[index + 2],
      );
      const minChannel = Math.min(
        data[index],
        data[index + 1],
        data[index + 2],
      );
      const brightness = (maxChannel / 255) * alpha;
      const saturation =
        maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
      const isNonblack = value > ACTIVE_LUMINANCE_THRESHOLD;
      if (isNonblack && saturation >= 0.18 && brightness >= 0.055) {
        const red = data[index] / 255;
        const green = data[index + 1] / 255;
        const blue = data[index + 2] / 255;
        const normalizedMax = Math.max(red, green, blue);
        const normalizedMin = Math.min(red, green, blue);
        const chroma = normalizedMax - normalizedMin;
        let hue = 0;
        if (chroma > 0) {
          if (normalizedMax === red) {
            hue = ((green - blue) / chroma) % 6;
          } else if (normalizedMax === green) {
            hue = (blue - red) / chroma + 2;
          } else {
            hue = (red - green) / chroma + 4;
          }
          hue /= 6;
          if (hue < 0) {
            hue += 1;
          }
        }
        const familyIndex =
          Math.floor(hue * HUE_FAMILY_COUNT) % HUE_FAMILY_COUNT;
        hueFamilyCounts[familyIndex] += 1;
        chromaticPixelCount += 1;
      }
      const isCentral =
        x >= width * 0.15 &&
        x <= width * 0.85 &&
        y >= height * 0.15 &&
        y <= height * 0.85;
      luminance.push(value);
      gridValues.push(value);
      centralNonblack.push(isCentral && isNonblack);
      rowWidth += 1;
      if (isCentral) {
        centralSampleCount += 1;
      }
      if (isNonblack) {
        nonblackCount += 1;
        activeSaturationTotal += saturation;
        activeChromaTotal += ((maxChannel - minChannel) / 255) * alpha;
      }
      if (value < 0.035) {
        negativeSpaceCount += 1;
      }
      if (value >= 0.12 && value <= 0.42) {
        broadWashCount += 1;
      }
      if (value > 0.42) {
        brightPlateCount += 1;
      }
      if (brightness >= 0.78 && saturation < 0.22) {
        nearWhiteCount += 1;
      }
      if (brightness >= 0.72 && saturation < 0.32) {
        brightLowSaturationCount += 1;
      }
    }
    gridWidth = Math.max(gridWidth, rowWidth);
    gridHeight += 1;
  }

  const visited = new Uint8Array(gridValues.length);
  let largestCentralComponent = 0;
  const stack = [];
  for (let index = 0; index < centralNonblack.length; index += 1) {
    if (!centralNonblack[index] || visited[index]) {
      continue;
    }
    let componentSize = 0;
    visited[index] = 1;
    stack.push(index);
    while (stack.length > 0) {
      const current = stack.pop();
      componentSize += 1;
      const x = current % gridWidth;
      const y = Math.floor(current / gridWidth);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < gridWidth - 1 ? current + 1 : -1,
        y > 0 ? current - gridWidth : -1,
        y < gridHeight - 1 ? current + gridWidth : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || visited[next] || !centralNonblack[next]) {
          continue;
        }
        visited[next] = 1;
        stack.push(next);
      }
    }
    largestCentralComponent = Math.max(largestCentralComponent, componentSize);
  }

  luminance.sort((left, right) => left - right);
  const percentile = (p) => {
    const index = Math.min(
      luminance.length - 1,
      Math.max(0, Math.floor((luminance.length - 1) * p)),
    );
    return luminance[index] ?? 0;
  };
  const p50 = percentile(0.5);
  const p98 = percentile(0.98);
  const brightThreshold = p98 * 0.72;
  const brightLaneRatio =
    luminance.filter(
      (value) => value >= brightThreshold && value > ACTIVE_LUMINANCE_THRESHOLD,
    ).length / luminance.length;
  const valueAt = (x, y) =>
    gridValues[
      Math.min(gridHeight - 1, Math.max(0, y)) * gridWidth +
        Math.min(gridWidth - 1, Math.max(0, x))
    ] ?? 0;
  const activeGradientValues = [];
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const value = valueAt(x, y);
      if (value <= ACTIVE_LUMINANCE_THRESHOLD) {
        continue;
      }
      activeGradientValues.push(
        Math.max(
          Math.abs(value - valueAt(x - 1, y)),
          Math.abs(value - valueAt(x + 1, y)),
          Math.abs(value - valueAt(x, y - 1)),
          Math.abs(value - valueAt(x, y + 1)),
        ),
      );
    }
  }
  activeGradientValues.sort((left, right) => left - right);
  const activeGradientP95 =
    activeGradientValues.length === 0
      ? 0
      : activeGradientValues[
          Math.min(
            activeGradientValues.length - 1,
            Math.max(0, Math.floor((activeGradientValues.length - 1) * 0.95)),
          )
        ];
  const gradientHotspotRatio =
    activeGradientValues.length === 0
      ? 0
      : activeGradientValues.filter(
          (value) => value >= ACTIVE_GRADIENT_HOTSPOT_THRESHOLD,
        ).length / activeGradientValues.length;
  const activePixelShare = nonblackCount / luminance.length;
  const activeGradientCoverage = activePixelShare * gradientHotspotRatio;
  const fineLatticePressure = activeGradientP95 * activeGradientCoverage;
  const visibleHueFamilyThreshold = Math.max(
    3,
    Math.floor(chromaticPixelCount * 0.06),
  );
  const visibleHueFamilyCount = hueFamilyCounts.filter(
    (count) => count >= visibleHueFamilyThreshold,
  ).length;
  const dominantHueFamilyRatio =
    chromaticPixelCount === 0
      ? 0
      : Math.max(...hueFamilyCounts) / chromaticPixelCount;

  const metrics = {
    p50,
    p98,
    nonblankRatio: nonblackCount / luminance.length,
    negativeSpaceRatio: negativeSpaceCount / luminance.length,
    broadWashRatio: broadWashCount / luminance.length,
    brightPlateRatio:
      nonblackCount === 0 ? 0 : brightPlateCount / nonblackCount,
    nearWhitePixelRatio: nearWhiteCount / luminance.length,
    brightLowSaturationPixelRatio: brightLowSaturationCount / luminance.length,
    centralConnectedNonblackRatio:
      centralSampleCount === 0
        ? 0
        : largestCentralComponent / centralSampleCount,
    brightLaneRatio,
    activeGradientP95,
    gradientHotspotRatio,
    activeGradientCoverage,
    fineLatticePressure,
    contrastRatio: p98 / Math.max(p50, 1e-4),
    chromaticPixelRatio: chromaticPixelCount / luminance.length,
    activeMeanSaturation:
      nonblackCount === 0 ? 0 : activeSaturationTotal / nonblackCount,
    activeMeanChroma:
      nonblackCount === 0 ? 0 : activeChromaTotal / nonblackCount,
    visibleHueFamilyCount,
    dominantHueFamilyRatio,
  };

  if (artifactPath) {
    await writeFile(artifactPath, screenshotPng);
  }

  return metrics;
}

function coefficientOfVariation(values) {
  const mean =
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    Math.max(1, values.length);
  return Math.sqrt(variance) / Math.max(mean, 1e-4);
}

function standardDeviation(values) {
  const mean =
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    Math.max(1, values.length);
  return Math.sqrt(variance);
}

async function seekPlaybackTimeline(page, ratio) {
  const timeline = page.getByTestId("playback-timeline");
  await expect(timeline).toBeVisible();
  const box = await timeline.boundingBox();
  if (!box) {
    throw new Error("Playback timeline did not render a bounding box.");
  }
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

async function awaitCanvasPresentation(page) {
  // Headless WebGPU presentation can drop out for a whole page load under
  // sequential GPU pressure; measuring a non-presenting canvas would judge
  // the harness, not the render. Field-active states must show pixels.
  await expect
    .poll(async () => (await readCanvasLuminanceMetrics(page)).nonblankRatio, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0.01);
}

async function captureCanvasMetricArtifact(page, testInfo, name) {
  const artifactPath = testInfo.outputPath(`${name}.png`);
  const metrics = await readCanvasLuminanceMetrics(page, artifactPath);
  await testInfo.attach(name, {
    path: artifactPath,
    contentType: "image/png",
  });
  return metrics;
}

async function installFrozen528Fixture(page, descriptorId) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await waitForControlSurface(page);
  await applyOpticalMeasurementControls(page);
  await setControl(page, "auditEnabled", true);
  await setControl(page, "injectTestTone", true);
  await setControl(page, "testToneHz", 528);
  await setControl(page, "testToneAmplitude", 0.5);

  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          backend: window.__baryonRendererInfo?.backend ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
          spectralLaneCacheReady:
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.spectralLaneCacheReady ?? false,
          fixtureBridge: typeof window.__baryonAuditFixture,
        })),
      { timeout: 20_000 },
    )
    .toEqual({
      backend: "WebGPUBackend",
      fieldState: "test",
      volumeVisible: true,
      spectralLaneCacheReady: true,
      fixtureBridge: "object",
    });

  const installed = await page.evaluate(async (fixtureDescriptorId) => {
    const snapshot = await window.__baryonAuditFixture.snapshotDescriptor({
      descriptorId: fixtureDescriptorId,
      viewPreset: "front",
      output: { width: 512, height: 384 },
    });
    const status = await window.__baryonAuditFixture.install(
      snapshot.descriptor,
    );
    return { descriptorHash: snapshot.descriptorHash, status };
  }, descriptorId);
  expect(installed.status.phase).toBe("installed");
  expect(installed.status.captureAllowed).toBe(true);
  expect(installed.status.descriptorHash).toBe(installed.descriptorHash);
  return installed;
}

async function teardownFixtureAndAwaitLiveField(page) {
  const status = await page.evaluate(() =>
    window.__baryonAuditFixture.teardown(),
  );
  expect(status.phase).toBe("idle");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
      ),
    )
    .toBe("test");
}

async function setCameraPreset(page, preset) {
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof window.__baryonCameraControls?.setPreset === "function",
      ),
    )
    .toBe(true);
  await page.evaluate((nextPreset) => {
    window.__baryonCameraControls.setPreset(nextPreset);
  }, preset);
  await page.waitForTimeout(450);
}

async function setCameraPose(page, cameraPose) {
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof window.__baryonCameraControls?.setPose === "function",
      ),
    )
    .toBe(true);
  await page.evaluate((nextPose) => {
    window.__baryonCameraControls.setPose(nextPose);
  }, cameraPose);
  await page.waitForTimeout(450);
}

test.describe("laser cymatic optical measurement visual audit", () => {
  test("528 Hz tone meets optical measurement canvas metrics", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await applyOpticalMeasurementControls(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          backend: window.__baryonRendererInfo?.backend ?? null,
          isFallback: window.__baryonRendererInfo?.isFallback ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        backend: "WebGPUBackend",
        isFallback: false,
        fieldState: "test",
        volumeVisible: true,
      });
    await awaitCanvasPresentation(page);

    await expect
      .poll(readCanvasLuminanceMetrics.bind(null, page), { timeout: 10_000 })
      .toMatchObject({
        nonblankRatio: expect.any(Number),
        negativeSpaceRatio: expect.any(Number),
        brightLaneRatio: expect.any(Number),
        contrastRatio: expect.any(Number),
        broadWashRatio: expect.any(Number),
        activeGradientCoverage: expect.any(Number),
        fineLatticePressure: expect.any(Number),
      });

    const metrics = await readCanvasLuminanceMetrics(
      page,
      testInfo.outputPath("photographic-top-down-528.png"),
    );
    console.log(
      "raymarch-528-diagnostic",
      await page.evaluate(() => {
        const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
        return {
          materialOutputVisible: debug.materialOutputVisible,
          observationEnergy: debug.observationEnergy,
          avgOpacity: debug.avgOpacity,
          avgDensity: debug.avgDensity,
          materialProbePreBloomRadiance: debug.materialProbePreBloomRadiance,
          materialProbeBaseRadiance: debug.materialProbeBaseRadiance,
          gain: debug.materialProbeHolographicBaseRadianceGain,
        };
      }),
      metrics,
    );
    await testInfo.attach("photographic-top-down-528", {
      path: testInfo.outputPath("photographic-top-down-528.png"),
      contentType: "image/png",
    });
    // Promoted Checkpoint B base-only legibility gates. The prior one-percent
    // floors could pass a technically nonblack but unreadable carrier.
    expect(metrics.p98).toBeGreaterThanOrEqual(0.12);
    expect(metrics.nonblankRatio).toBeGreaterThanOrEqual(0.05);
    expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.55);
    expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.015);
    expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.14);
    expect(metrics.contrastRatio).toBeGreaterThanOrEqual(5.0);
    expect(metrics.broadWashRatio).toBeLessThan(0.24);
    expect(metrics.centralConnectedNonblackRatio).toBeGreaterThanOrEqual(0.02);
    expect(metrics.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(metrics.nonblankRatio, 1e-6),
    );
  });

  test("black-field canary fails every base legibility gate on silence", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await applyOpticalMeasurementControls(page);
    await setControl(page, "auditEnabled", true);
    // The idle logo is a deliberate product feature, not carrier support;
    // the canary witnesses the acoustic carrier clearing on silence.
    await setControl(page, "idleLogoIntensity", 0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          backend: window.__baryonRendererInfo?.backend ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
        })),
      )
      .toEqual({
        backend: "WebGPUBackend",
        fieldState: "idle",
      });
    await page.waitForTimeout(600);

    const metrics = await readCanvasLuminanceMetrics(page);
    // Silence keeps the carrier fully cleared; the same numbers prove the
    // harness cannot pass an empty field through the promoted base gates.
    expect(metrics.nonblankRatio).toBeLessThanOrEqual(0.001);
    expect(metrics.p98).toBeLessThanOrEqual(0.01);
    expect(metrics.nonblankRatio).toBeLessThan(0.05);
    expect(metrics.p98).toBeLessThan(0.12);
    expect(metrics.centralConnectedNonblackRatio).toBeLessThan(0.02);
    expect(metrics.contrastRatio).toBeLessThan(5.0);
  });

  test("holographic Fresnel control materially reshapes the production carrier", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "raymarchSteps", 72);
    await setControl(page, "densityGain", 4);
    await setControl(page, "laserDeflectionGain", 1.2);
    await setControl(page, "holographicIntensity", 1);
    await setControl(page, "holographicFresnelPower", 2.4);
    await setControl(page, "bloomEnabled", true);
    await setControl(page, "bloomStrength", 1.18);
    await setControl(page, "bloomRadius", 0);
    await setControl(page, "bloomThreshold", 0.5);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "colorMode", "static");
    await setControl(page, "volumeColor", "#079bb0");
    await setControl(page, "surfaceColor", "#73efff");
    await setControl(page, "auditEnabled", true);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);
    await setControl(page, "freezeModeSlots", true);
    await setControl(page, "idleLogoIntensity", 0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({ fieldState: "test", volumeVisible: true });

    await setControl(page, "holographicIntensity", 0);
    await awaitCanvasPresentation(page);
    const fresnelOff = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "fresnel-off-static-528",
    );

    await setControl(page, "holographicIntensity", 1);
    await setControl(page, "holographicFresnelPower", 4.8);
    await awaitCanvasPresentation(page);
    const fresnelOn = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "fresnel-on-static-528",
    );

    console.log("fresnel-production-delta", { fresnelOff, fresnelOn });
    expect(fresnelOn.p98).toBeGreaterThan(fresnelOff.p98 * 1.15);
    expect(fresnelOn.activeGradientP95).toBeGreaterThan(
      fresnelOff.activeGradientP95 * 1.15,
    );
    expect(fresnelOn.brightLaneRatio).toBeGreaterThanOrEqual(0.015);
    expect(fresnelOn.broadWashRatio).toBeLessThan(0.24);
    expect(fresnelOn.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(fresnelOn.nonblankRatio, 1e-6),
    );
  });

  test("SMAA topology preserves the carrier color family when disabled", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "raymarchSteps", 72);
    await setControl(page, "densityGain", 4);
    await setControl(page, "laserDeflectionGain", 1.2);
    await setControl(page, "holographicIntensity", 1);
    await setControl(page, "holographicFresnelPower", 2.4);
    await setControl(page, "bloomEnabled", true);
    await setControl(page, "bloomStrength", 1.18);
    await setControl(page, "bloomRadius", 0);
    await setControl(page, "bloomThreshold", 0.5);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "colorMode", "static");
    await setControl(page, "volumeColor", "#5be3f4");
    await setControl(page, "surfaceColor", "#5be3f4");
    await setControl(page, "auditEnabled", true);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);
    await setControl(page, "freezeModeSlots", true);
    await setControl(page, "idleLogoIntensity", 0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({ fieldState: "test", volumeVisible: true });

    await setControl(page, "smaaEnabled", true);
    await awaitCanvasPresentation(page);
    await page.waitForTimeout(100);
    const smaaOn = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "smaa-on-static-528",
    );

    await setControl(page, "smaaEnabled", false);
    await awaitCanvasPresentation(page);
    await page.waitForTimeout(100);
    const smaaOff = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "smaa-off-static-528",
    );

    expect(smaaOn.chromaticPixelRatio).toBeGreaterThan(0.1);
    expect(smaaOff.chromaticPixelRatio).toBeGreaterThan(0.1);
    expect(smaaOn.activeMeanSaturation).toBeGreaterThan(0.58);
    expect(smaaOff.activeMeanSaturation).toBeGreaterThan(0.58);
    expect(smaaOn.activeMeanChroma).toBeGreaterThan(0.06);
    expect(smaaOff.activeMeanChroma).toBeGreaterThan(0.06);
    expect(
      Math.abs(smaaOn.activeMeanSaturation - smaaOff.activeMeanSaturation),
    ).toBeLessThan(0.03);
    expect(
      Math.abs(smaaOn.chromaticPixelRatio - smaaOff.chromaticPixelRatio),
    ).toBeLessThan(0.02);
    expect(Math.abs(smaaOn.p98 - smaaOff.p98)).toBeLessThan(
      Math.max(smaaOn.p98, smaaOff.p98) * 0.05,
    );
  });

  test("dense polyphonic fixture keeps spectral lane cache active with multiple hue families", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(150_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await applyOpticalMeasurementControls(page);
    await setControl(page, "auditEnabled", true);
    await page.locator('input[type="file"]').setInputFiles({
      name: "dense-polyphonic-12s.wav",
      mimeType: "audio/wav",
      buffer: createDensePolyphonicFixtureWavBuffer(),
    });
    const playButton = page.getByRole("button", { name: "Play", exact: true });
    await expect(playButton).toBeEnabled();
    await playButton.click();
    await seekPlaybackTimeline(page, 0.5);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
        })),
      )
      .toEqual({
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        volumeVisible: true,
        modeSlotCount: expect.any(Number),
      });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const controls = window.__baryonControls?.getState?.() ?? {};
            const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
            return {
              colorMode: controls.colorMode ?? null,
              spectralLightEvaluationMode:
                debug.spectralLightEvaluationMode ?? null,
              spectralLightImplementationState:
                debug.spectralLightImplementationState ?? null,
              spectralLaneCacheReady: debug.spectralLaneCacheReady ?? false,
              spectralLaneCacheActive: debug.spectralLaneCacheActive ?? false,
              spectralLaneCacheComputedAtSec:
                debug.spectralLaneCacheComputedAtSec ?? null,
              spectralLaneCacheBuiltAtSec:
                debug.spectralLaneCacheBuiltAtSec ?? null,
            };
          }),
        { timeout: 15_000 },
      )
      .toMatchObject({
        colorMode: "spectral",
        spectralLightEvaluationMode: "lane-cache",
        spectralLightImplementationState: "lane-cache-radiance",
        spectralLaneCacheReady: true,
        spectralLaneCacheActive: true,
        spectralLaneCacheComputedAtSec: expect.any(Number),
        spectralLaneCacheBuiltAtSec: expect.any(Number),
      });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.spectralLaneCacheRadianceInputTotal ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.spectralLaneCacheActivePacketCount ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await awaitCanvasPresentation(page);

    const frames = [];
    for (let index = 0; index < 8; index += 1) {
      frames.push(
        await readCanvasLuminanceMetrics(
          page,
          index === 0
            ? testInfo.outputPath("photographic-dense-polyphonic.png")
            : null,
        ),
      );
      await page.waitForTimeout(125);
    }
    await testInfo.attach("photographic-dense-polyphonic", {
      path: testInfo.outputPath("photographic-dense-polyphonic.png"),
      contentType: "image/png",
    });

    const firstFrame = frames[0];
    expect(firstFrame.nonblankRatio).toBeGreaterThan(0.01);
    expect(firstFrame.negativeSpaceRatio).toBeGreaterThanOrEqual(0.38);
    expect(firstFrame.contrastRatio).toBeGreaterThanOrEqual(3.0);
    expect(firstFrame.broadWashRatio).toBeLessThan(0.38);
    expect(firstFrame.brightPlateRatio).toBeLessThan(0.38);
    expect(firstFrame.nearWhitePixelRatio).toBeLessThan(0.24);
    expect(firstFrame.brightLowSaturationPixelRatio).toBeLessThan(0.34);
    expect(firstFrame.centralConnectedNonblackRatio).toBeGreaterThan(0.01);
    expect(firstFrame.chromaticPixelRatio).toBeGreaterThan(0.001);
    expect(firstFrame.visibleHueFamilyCount).toBeGreaterThanOrEqual(2);
    expect(firstFrame.dominantHueFamilyRatio).toBeLessThan(0.92);
    expect(
      coefficientOfVariation(frames.map((frame) => frame.p98)),
    ).toBeLessThan(0.18);
    expect(
      standardDeviation(frames.map((frame) => frame.negativeSpaceRatio)),
    ).toBeLessThan(0.05);
  });

  test("528 Hz tone keeps photographic material identity across camera views", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await applyOpticalMeasurementControls(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          backend: window.__baryonRendererInfo?.backend ?? null,
          isFallback: window.__baryonRendererInfo?.isFallback ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        backend: "WebGPUBackend",
        isFallback: false,
        fieldState: "test",
        volumeVisible: true,
      });
    await awaitCanvasPresentation(page);

    const topDown = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "photographic-cross-view-top-down",
    );
    await setCameraPreset(page, "side");
    const side = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "photographic-cross-view-side",
    );
    await setCameraPreset(page, "top-down");
    await setCameraPose(page, {
      position: { x: 0, y: 6.36, z: 6.36 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 65,
    });
    const oblique = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "photographic-cross-view-oblique",
    );

    expect(topDown.negativeSpaceRatio).toBeGreaterThanOrEqual(0.55);
    for (const metrics of [side, oblique]) {
      expect(metrics.nonblankRatio).toBeGreaterThan(0.01);
      expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.008);
      expect(metrics.contrastRatio).toBeGreaterThanOrEqual(3.0);
      expect(metrics.broadWashRatio).toBeLessThanOrEqual(
        topDown.broadWashRatio + 0.05,
      );
    }
  });

  test("frozen descriptor renders identically across capture cadences without new transport work", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFrozen528Fixture(page, "frozen-528-front-stability");

    const stability = await page.evaluate(async () => {
      const fixture = window.__baryonAuditFixture;
      const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const reference = await fixture.exportBuffers();
      const referencePixels = reference.displayRgba;
      const sealedDispatchCount = fixture.status().seal.transportDispatchCount;
      const meanAbsoluteDifferences = [];
      // 30, 50, and 60 fps capture cadences over the same sealed fixture.
      for (const cadenceMs of [33, 20, 16]) {
        await waitMs(cadenceMs * 4);
        await fixture.assertSealed();
        const next = await fixture.exportBuffers();
        const nextPixels = next.displayRgba;
        let total = 0;
        for (let index = 0; index < referencePixels.length; index += 1) {
          total += Math.abs(nextPixels[index] - referencePixels[index]);
        }
        meanAbsoluteDifferences.push(
          total / Math.max(1, referencePixels.length) / 255,
        );
      }
      const finalStatus = fixture.status();
      const bufferToBase64 = (typedArray) => {
        const bytes = new Uint8Array(
          typedArray.buffer,
          typedArray.byteOffset,
          typedArray.byteLength,
        );
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode.apply(
            null,
            bytes.subarray(index, index + 0x8000),
          );
        }
        return btoa(binary);
      };
      return {
        meanAbsoluteDifferences,
        sealedDispatchCount,
        finalDispatchCount: finalStatus.seal.transportDispatchCount,
        captureAllowed: finalStatus.captureAllowed,
        width: reference.width,
        height: reference.height,
        displayRgbaBase64: bufferToBase64(referencePixels),
      };
    });

    const frozenPng = await sharp(
      Buffer.from(stability.displayRgbaBase64, "base64"),
      {
        raw: {
          width: stability.width,
          height: stability.height,
          channels: 4,
        },
      },
    )
      .png()
      .toBuffer();
    await writeFile(testInfo.outputPath("frozen-528-front.png"), frozenPng);
    await testInfo.attach("frozen-528-front", {
      path: testInfo.outputPath("frozen-528-front.png"),
      contentType: "image/png",
    });

    expect(stability.captureAllowed).toBe(true);
    expect(stability.finalDispatchCount).toBe(stability.sealedDispatchCount);
    for (const difference of stability.meanAbsoluteDifferences) {
      expect(difference).toBeLessThanOrEqual(0.005);
    }

    await teardownFixtureAndAwaitLiveField(page);
  });

  test("production accent stays a bounded caustic population over the base", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await applyOpticalMeasurementControls(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);
    await setControl(page, "idleLogoIntensity", 0);

    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            fieldState:
              window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
            volumeVisible:
              window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ??
              false,
            laserTransportReady:
              window.__baryonAuditSnapshot?.raymarchDebug
                ?.laserTransportReady ?? false,
            fixtureBridge: typeof window.__baryonAuditFixture,
          })),
        { timeout: 30_000 },
      )
      .toEqual({
        fieldState: "test",
        volumeVisible: true,
        laserTransportReady: true,
        fixtureBridge: "object",
      });
    await awaitCanvasPresentation(page);

    // The selected production accent is readiness-gated and always on with
    // ready transport: bright lanes stay inside the dossier band and
    // near-white stays a small caustic population over the readable base.
    const accentOn = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-accent-528",
    );
    expect(accentOn.brightLaneRatio).toBeGreaterThanOrEqual(0.015);
    expect(accentOn.brightLaneRatio).toBeLessThanOrEqual(0.14);
    expect(accentOn.p98).toBeGreaterThanOrEqual(0.12);
    expect(accentOn.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(accentOn.nonblankRatio, 1e-6),
    );
    expect(accentOn.negativeSpaceRatio).toBeGreaterThanOrEqual(0.5);
    expect(accentOn.broadWashRatio).toBeLessThan(0.24);
  });

  test("16-phase accent attachment stays carrier-contained and follows the field", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(300_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFrozen528Fixture(page, "attachment-basis");
    await page.evaluate(() => window.__baryonAuditFixture.teardown());
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
        ),
      )
      .toBe("test");

    const phases = await page.evaluate(async () => {
      const fixture = window.__baryonAuditFixture;
      const snap = await fixture.snapshotDescriptor({
        descriptorId: "attachment-16-phase",
        viewPreset: "front",
        output: { width: 384, height: 288 },
        checkpointMode: "current",
      });
      const halfToFloat = (half) => {
        const sign = (half & 0x8000) >> 15;
        const exponent = (half & 0x7c00) >> 10;
        const fraction = half & 0x03ff;
        if (exponent === 0)
          return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024);
        if (exponent === 0x1f)
          return fraction ? Number.NaN : (sign ? -1 : 1) * Infinity;
        return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024);
      };
      const decode = ({ pixels }) => {
        if (pixels instanceof Float32Array) return pixels;
        const out = new Float32Array(pixels.length);
        for (let i = 0; i < pixels.length; i += 1)
          out[i] = halfToFloat(pixels[i]);
        return out;
      };
      const toneHz = 528;
      const period = 1 / toneHz;
      const baseTime = snap.descriptor.phase.evaluationTimeSec;
      const results = [];
      for (let k = 0; k < 16; k += 1) {
        const candidate = structuredClone(snap.descriptor);
        candidate.phase.evaluationTimeSec = baseTime + (k * period) / 16;
        await fixture.install(candidate);
        const exported = await fixture.exportBuffers();
        const accent = decode(exported.checkpointAovs.accentRadiance);
        const coverage = decode(exported.checkpointAovs.coverage);
        const width = exported.checkpointAovs.width;
        const height = exported.checkpointAovs.height;

        // Carrier support mask, dilated by one pixel.
        const support = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i += 1) {
          support[i] = coverage[i * 4] > 1e-4 ? 1 : 0;
        }
        const dilated = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            if (!support[i]) continue;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  dilated[ny * width + nx] = 1;
                }
              }
            }
          }
        }

        let accentTotal = 0;
        let accentContained = 0;
        let accentCentroidX = 0;
        let accentCentroidY = 0;
        let carrierCentroidX = 0;
        let carrierCentroidY = 0;
        let carrierTotal = 0;
        for (let i = 0; i < width * height; i += 1) {
          const energy =
            Math.max(0, accent[i * 4]) +
            Math.max(0, accent[i * 4 + 1]) +
            Math.max(0, accent[i * 4 + 2]);
          if (energy > 0) {
            accentTotal += energy;
            if (dilated[i]) accentContained += energy;
            accentCentroidX += energy * (i % width);
            accentCentroidY += energy * Math.floor(i / width);
          }
          const cov = coverage[i * 4];
          if (cov > 1e-4) {
            carrierTotal += cov;
            carrierCentroidX += cov * (i % width);
            carrierCentroidY += cov * Math.floor(i / width);
          }
        }
        results.push({
          phaseIndex: k,
          accentTotal,
          containmentShare: accentTotal > 0 ? accentContained / accentTotal : 1,
          accentCentroid:
            accentTotal > 0
              ? [accentCentroidX / accentTotal, accentCentroidY / accentTotal]
              : null,
          carrierCentroid:
            carrierTotal > 0
              ? [
                  carrierCentroidX / carrierTotal,
                  carrierCentroidY / carrierTotal,
                ]
              : null,
        });
        await fixture.teardown();
      }
      return results;
    });

    expect(phases).toHaveLength(16);
    let phasesWithAccent = 0;
    for (const phase of phases) {
      if (phase.accentTotal > 0) {
        phasesWithAccent += 1;
        // Dossier gate: at least 0.999 of accent-only energy inside a
        // one-pixel dilation of current carrier support at every checkpoint.
        expect(phase.containmentShare).toBeGreaterThanOrEqual(0.999);
        // A world-stuck accent detaches from the carrier centroid; a bounded
        // multiplicative accent cannot wander off its owning support.
        const [ax, ay] = phase.accentCentroid;
        const [cx, cy] = phase.carrierCentroid;
        expect(Math.hypot(ax - cx, ay - cy)).toBeLessThanOrEqual(48);
      }
    }
    expect(phasesWithAccent).toBeGreaterThan(0);
  });

  test("frozen base checkpoint passes the pre-tone scene-linear headroom gate", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFrozen528Fixture(page, "frozen-528-front-headroom");

    const aovTransfer = await page.evaluate(async () => {
      const exported = await window.__baryonAuditFixture.exportBuffers();
      const halfToFloat = (half) => {
        const sign = (half & 0x8000) >> 15;
        const exponent = (half & 0x7c00) >> 10;
        const fraction = half & 0x03ff;
        if (exponent === 0) {
          return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024);
        }
        if (exponent === 0x1f) {
          return fraction ? Number.NaN : (sign ? -1 : 1) * Infinity;
        }
        return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024);
      };
      const decodeAov = ({ pixels }) => {
        if (pixels instanceof Float32Array) {
          return pixels;
        }
        const decoded = new Float32Array(pixels.length);
        for (let index = 0; index < pixels.length; index += 1) {
          decoded[index] = halfToFloat(pixels[index]);
        }
        return decoded;
      };
      const bufferToBase64 = (floatArray) => {
        const bytes = new Uint8Array(
          floatArray.buffer,
          floatArray.byteOffset,
          floatArray.byteLength,
        );
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode.apply(
            null,
            bytes.subarray(index, index + 0x8000),
          );
        }
        return btoa(binary);
      };
      return {
        width: exported.checkpointAovs.width,
        height: exported.checkpointAovs.height,
        baseRadianceBase64: bufferToBase64(
          decodeAov(exported.checkpointAovs.baseRadiance),
        ),
        coverageBase64: bufferToBase64(
          decodeAov(exported.checkpointAovs.coverage),
        ),
      };
    });

    const decodeFloatBase64 = (base64) => {
      const bytes = Buffer.from(base64, "base64");
      return new Float32Array(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
    };
    const headroom = evaluateStraightSceneLinearHeadroom({
      premultipliedRadiance: decodeFloatBase64(aovTransfer.baseRadianceBase64),
      coverage: decodeFloatBase64(aovTransfer.coverageBase64),
    });

    expect(headroom.activeSampleCount).toBeGreaterThan(0);
    expect(headroom.achieved).toBe(true);
    expect(headroom.passesLuminance).toBe(true);
    expect(headroom.passesMaxChannel).toBe(true);
    expect(headroom.passesOverloadShare).toBe(true);

    await teardownFixtureAndAwaitLiveField(page);
  });
});
