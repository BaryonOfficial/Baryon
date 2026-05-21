import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const BARYON_4_PRESET = "baryon-4";
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
    const leftFrame =
      fixtureFrames[Math.max(0, rightIndex - 1)] ?? rightFrame;
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

async function readCanvasLuminanceMetrics(page) {
  const canvas = page.locator("#root > div canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Visualizer canvas did not render a bounding box.");
  }
  const screenshot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  });
  const dataUrl = `data:image/png;base64,${Buffer.from(screenshot).toString(
    "base64",
  )}`;

  return page.evaluate(async (src) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = src;
    });
    const scratch = document.createElement("canvas");
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("2D sampling context unavailable");
    }

    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(
      0,
      0,
      scratch.width,
      scratch.height,
    );
    const sampleStride = Math.max(1, Math.floor(Math.min(width, height) / 256));
    const luminance = [];
    let nonblackCount = 0;
    let negativeSpaceCount = 0;
    let broadWashCount = 0;
    let brightPlateCount = 0;

    for (let y = 0; y < height; y += sampleStride) {
      for (let x = 0; x < width; x += sampleStride) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3] / 255;
        const value =
          ((0.2126 * data[index] +
            0.7152 * data[index + 1] +
            0.0722 * data[index + 2]) /
            255) *
          alpha;
        luminance.push(value);
        if (value > 0.004) {
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
      }
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
      luminance.filter((value) => value >= brightThreshold && value > 0.004)
        .length / luminance.length;

    return {
      p50,
      p98,
      nonblankRatio: nonblackCount / luminance.length,
      negativeSpaceRatio: negativeSpaceCount / luminance.length,
      broadWashRatio: broadWashCount / luminance.length,
      brightPlateRatio:
        nonblackCount === 0 ? 0 : brightPlateCount / nonblackCount,
      brightLaneRatio,
      contrastRatio: p98 / Math.max(p50, 1e-4),
    };
  }, dataUrl);
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

test.describe("laser cymatic optical measurement visual audit", () => {
  test("baryon-4 528 Hz tone meets optical measurement canvas metrics", async ({
    page,
    browserName,
  }) => {
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
      });

    const metrics = await readCanvasLuminanceMetrics(page);
    expect(metrics.nonblankRatio).toBeGreaterThan(0.01);
    expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.52);
    expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.018);
    expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.16);
    expect(metrics.contrastRatio).toBeGreaterThanOrEqual(4.0);
    expect(metrics.broadWashRatio).toBeLessThan(0.3);
  });

  test("baryon-4 dense polyphonic fixture remains structured and temporally stable", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
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
      frames.push(await readCanvasLuminanceMetrics(page));
      await page.waitForTimeout(125);
    }

    const firstFrame = frames[0];
    expect(firstFrame.nonblankRatio).toBeGreaterThan(0.01);
    expect(firstFrame.negativeSpaceRatio).toBeGreaterThanOrEqual(0.38);
    expect(firstFrame.contrastRatio).toBeGreaterThanOrEqual(2.6);
    expect(firstFrame.broadWashRatio).toBeLessThan(0.42);
    expect(firstFrame.brightPlateRatio).toBeLessThan(0.45);
    expect(coefficientOfVariation(frames.map((frame) => frame.p98))).toBeLessThan(
      0.18,
    );
    expect(
      standardDeviation(frames.map((frame) => frame.negativeSpaceRatio)),
    ).toBeLessThan(0.04);
  });
});
