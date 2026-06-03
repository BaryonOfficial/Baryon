import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const BARYON_4_PRESET = "baryon-4";
const ACTIVE_LUMINANCE_THRESHOLD = 0.004;
const ACTIVE_GRADIENT_HOTSPOT_THRESHOLD = 0.12;
const DENSE_POLYPHONIC_FIXTURE = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/visualizer/src/utils/audio/fixtures/dense-polyphonic-12s.json",
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

async function loadBuiltInPreset(page, name) {
  await page.getByTestId("advanced-controls-trigger").click();
  await page.getByLabel("Load preset").selectOption(name);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = window.__baryonControls?.getState?.() ?? {};
        return {
          colorMode: controls.colorMode ?? null,
          raymarchSteps: controls.raymarchSteps ?? null,
          zeroPointPrecision: controls.zeroPointPrecision ?? null,
        };
      }),
    )
    .toEqual({
      colorMode: "spectral",
      raymarchSteps: expect.any(Number),
      zeroPointPrecision: expect.any(Number),
    });
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("advanced-controls-sidebar")).toBeHidden();
}

async function readCanvasLuminanceMetrics(page, artifactPath = null) {
  const canvas = page.locator("#root > div canvas").first();
  await expect(canvas).toBeVisible();
  const screenshotPng = await canvas.screenshot();
  const {
    data,
    info: { width, height },
  } = await sharp(screenshotPng)
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
  const gridValues = [];
  const centralNonblack = [];
  let gridWidth = 0;
  let gridHeight = 0;

  for (let y = 0; y < height; y += sampleStride) {
    let rowWidth = 0;
    for (let x = 0; x < width; x += sampleStride) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
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
      const isCentral =
        x >= width * 0.15 &&
        x <= width * 0.85 &&
        y >= height * 0.15 &&
        y <= height * 0.85;
      const isNonblack = value > ACTIVE_LUMINANCE_THRESHOLD;
      luminance.push(value);
      gridValues.push(value);
      centralNonblack.push(isCentral && isNonblack);
      rowWidth += 1;
      if (isCentral) {
        centralSampleCount += 1;
      }
      if (isNonblack) {
        nonblackCount += 1;
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

async function captureCanvasMetricArtifact(page, testInfo, name) {
  const artifactPath = testInfo.outputPath(`${name}.png`);
  const metrics = await readCanvasLuminanceMetrics(page, artifactPath);
  await testInfo.attach(name, {
    path: artifactPath,
    contentType: "image/png",
  });
  return metrics;
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
  test("baryon-4 528 Hz tone meets optical measurement canvas metrics", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await loadBuiltInPreset(page, BARYON_4_PRESET);
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
    await testInfo.attach("photographic-top-down-528", {
      path: testInfo.outputPath("photographic-top-down-528.png"),
      contentType: "image/png",
    });
    expect(metrics.nonblankRatio).toBeGreaterThan(0.01);
    expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.55);
    expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.015);
    expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.14);
    expect(metrics.contrastRatio).toBeGreaterThanOrEqual(5.0);
    expect(metrics.broadWashRatio).toBeLessThan(0.24);
    expect(metrics.centralConnectedNonblackRatio).toBeGreaterThan(0.01);
  });

  test("baryon-4 dense polyphonic fixture remains structured and temporally stable", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(150_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await loadBuiltInPreset(page, BARYON_4_PRESET);
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
    expect(
      coefficientOfVariation(frames.map((frame) => frame.p98)),
    ).toBeLessThan(0.18);
    expect(
      standardDeviation(frames.map((frame) => frame.negativeSpaceRatio)),
    ).toBeLessThan(0.05);
  });

  test("baryon-4 528 Hz tone keeps photographic material identity across camera views", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);

    await loadBuiltInPreset(page, BARYON_4_PRESET);
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
});
