import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "../../../packages/engine/src/core/raymarch/quantityLedger.js";
import { SPECTRAL_COLORIMETRY_REFERENCE } from "../../../packages/engine/src/core/raymarch/spectralColorimetry.js";
import { evaluateIntegratedSceneLinearHeadroom } from "../../../packages/engine/src/render/displayRadiance.js";

const ACTIVE_LUMINANCE_THRESHOLD = 0.004;
const ACTIVE_GRADIENT_HOTSPOT_THRESHOLD = 0.12;
const BRIGHT_ACTIVE_LUMINANCE_THRESHOLD = 0.42;
const BRIGHT_PLATE_SUPPORT_LUMINANCE_THRESHOLD = 0.12;
const BRIGHT_PLATE_SUPPORT_RADIUS = 2;
const HUE_FAMILY_COUNT = 12;
const OPTICAL_MEASUREMENT_CONTROLS = Object.freeze({
  raymarchSteps: 40,
  densityGain: 3.08,
  holographicIntensity: 0.52,
  holographicFresnelPower: 4.8,
  bloomEnabled: false,
  bloomStrength: 0.63536,
  bloomRadius: 0,
  bloomThreshold: 0.542,
  colorMode: "spectral",
  spectralChroma: 1,
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
  repeatCount = 1,
} = {}) {
  const fixtureDurationMs = DENSE_POLYPHONIC_FIXTURE.durationMs;
  const durationSeconds =
    (fixtureDurationMs / 1000) * Math.max(1, Math.floor(repeatCount));
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
  const resolveTones = (timeSeconds) => {
    const localTimeMs =
      (timeSeconds * 1000) % DENSE_POLYPHONIC_FIXTURE.durationMs;
    const segment = DENSE_POLYPHONIC_FIXTURE.segments.find(
      ({ startMs, endMs }) => localTimeMs >= startMs && localTimeMs < endMs,
    );
    if (segment?.equalPitchClasses) {
      const { referenceHz, count } = segment.equalPitchClasses;
      return Array.from(
        { length: count },
        (_, index) => referenceHz * 2 ** (index / count),
      );
    }
    return segment?.frequenciesHz ?? [440];
  };

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

  for (let index = 0; index < frameCount; index += 1) {
    const timeSeconds = index / sampleRate;
    const tones = resolveTones(timeSeconds);
    const toneScale = amplitude / Math.sqrt(tones.length);
    const normalized = Math.max(
      -1,
      Math.min(
        1,
        tones.reduce(
          (sum, frequency, toneIndex) =>
            sum +
            toneScale *
              Math.sin(
                2 * Math.PI * frequency * timeSeconds +
                  (Math.PI * toneIndex * (toneIndex - 1)) / tones.length,
              ),
          0,
        ),
      ),
    );
    view.setInt16(
      44 + index * bytesPerSample,
      Math.round(normalized * 0x7fff),
      true,
    );
  }

  return Buffer.from(buffer);
}

function srgbChannelToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function displayRgbToOklab(red, green, blue) {
  const linearRed = srgbChannelToLinear(red);
  const linearGreen = srgbChannelToLinear(green);
  const linearBlue = srgbChannelToLinear(blue);
  const l = Math.cbrt(
    0.4122214708 * linearRed +
      0.5363325363 * linearGreen +
      0.0514459929 * linearBlue,
  );
  const m = Math.cbrt(
    0.2119034982 * linearRed +
      0.6806995451 * linearGreen +
      0.1073969566 * linearBlue,
  );
  const s = Math.cbrt(
    0.0883024619 * linearRed +
      0.2817188376 * linearGreen +
      0.6299787005 * linearBlue,
  );
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
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
  const playbackTimeSeconds = await page.evaluate(() =>
    Number(
      document.querySelector('input[aria-label="Playback position"]')?.value ??
        Number.NaN,
    ),
  );
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
  const { data: topologyData } = await sharp(screenshotPng)
    .blur(1.5)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampleStride = Math.max(1, Math.floor(Math.min(width, height) / 256));
  const luminance = [];
  let nonblackCount = 0;
  let negativeSpaceCount = 0;
  let broadWashCount = 0;
  let brightActiveCount = 0;
  let nearWhiteCount = 0;
  let brightLowSaturationCount = 0;
  let centralSampleCount = 0;
  let chromaticPixelCount = 0;
  let activeSaturationTotal = 0;
  let activeChromaTotal = 0;
  let activeFixedLightnessChromaTotal = 0;
  const hueFamilyCounts = new Array(HUE_FAMILY_COUNT).fill(0);
  const gridValues = [];
  const topologyGridValues = [];
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
      const topologyValue =
        ((0.2126 * topologyData[index] +
          0.7152 * topologyData[index + 1] +
          0.0722 * topologyData[index + 2]) /
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
      const oklab = displayRgbToOklab(
        data[index] / 255,
        data[index + 1] / 255,
        data[index + 2] / 255,
      );
      const perceptualChroma = Math.hypot(oklab.a, oklab.b);
      const fixedLightnessChroma =
        (perceptualChroma *
          SPECTRAL_COLORIMETRY_REFERENCE.targetOklabLightness) /
        Math.max(oklab.lightness, 1e-6);
      if (isNonblack && saturation >= 0.18 && brightness >= 0.055) {
        let hue = Math.atan2(oklab.b, oklab.a) / (2 * Math.PI);
        if (hue < 0) hue += 1;
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
      topologyGridValues.push(topologyValue);
      centralNonblack.push(isCentral && isNonblack);
      rowWidth += 1;
      if (isCentral) {
        centralSampleCount += 1;
      }
      if (isNonblack) {
        nonblackCount += 1;
        activeSaturationTotal += saturation;
        activeChromaTotal += ((maxChannel - minChannel) / 255) * alpha;
        activeFixedLightnessChromaTotal += fixedLightnessChroma * alpha;
      }
      if (value < 0.035) {
        negativeSpaceCount += 1;
      }
      if (value >= 0.12 && value <= 0.42) {
        broadWashCount += 1;
      }
      if (value > BRIGHT_ACTIVE_LUMINANCE_THRESHOLD) {
        brightActiveCount += 1;
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
  let brightPlateCount = 0;
  const activeGradientValues = [];
  const fieldInteriorValues = [];
  const fieldInteriorGradientValues = [];
  const fieldInteriorLaplacianValues = [];
  const fieldCenterX = (gridWidth - 1) / 2;
  const fieldCenterY = (gridHeight - 1) / 2;
  const fieldInteriorRadius = Math.min(gridWidth, gridHeight) * 0.3;
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const value = valueAt(x, y);
      if (
        value > BRIGHT_ACTIVE_LUMINANCE_THRESHOLD &&
        x >= BRIGHT_PLATE_SUPPORT_RADIUS &&
        x < gridWidth - BRIGHT_PLATE_SUPPORT_RADIUS &&
        y >= BRIGHT_PLATE_SUPPORT_RADIUS &&
        y < gridHeight - BRIGHT_PLATE_SUPPORT_RADIUS
      ) {
        const support = BRIGHT_PLATE_SUPPORT_RADIUS;
        const hasBroadBrightSupport = [
          valueAt(x - support, y - support),
          valueAt(x, y - support),
          valueAt(x + support, y - support),
          valueAt(x - support, y),
          valueAt(x + support, y),
          valueAt(x - support, y + support),
          valueAt(x, y + support),
          valueAt(x + support, y + support),
        ].every(
          (neighbor) => neighbor >= BRIGHT_PLATE_SUPPORT_LUMINANCE_THRESHOLD,
        );
        if (hasBroadBrightSupport) {
          brightPlateCount += 1;
        }
      }
      const insideFieldInterior =
        x > 0 &&
        x < gridWidth - 1 &&
        y > 0 &&
        y < gridHeight - 1 &&
        Math.hypot(x - fieldCenterX, y - fieldCenterY) <= fieldInteriorRadius;
      if (insideFieldInterior) {
        const horizontalGradient =
          (valueAt(x + 1, y) - valueAt(x - 1, y)) * 0.5;
        const verticalGradient = (valueAt(x, y + 1) - valueAt(x, y - 1)) * 0.5;
        fieldInteriorValues.push(value);
        fieldInteriorGradientValues.push(
          Math.hypot(horizontalGradient, verticalGradient),
        );
        fieldInteriorLaplacianValues.push(
          Math.abs(
            valueAt(x - 1, y) +
              valueAt(x + 1, y) +
              valueAt(x, y - 1) +
              valueAt(x, y + 1) -
              4 * value,
          ),
        );
      }
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
  fieldInteriorGradientValues.sort((left, right) => left - right);
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
    1,
    Math.ceil(chromaticPixelCount * 0.05),
  );
  const visibleHueFamilyCount = hueFamilyCounts.filter(
    (count) => count >= visibleHueFamilyThreshold,
  ).length;
  const dominantHueFamilyRatio =
    chromaticPixelCount === 0
      ? 0
      : Math.max(...hueFamilyCounts) / chromaticPixelCount;
  const spatialHueEntropyBits = hueFamilyCounts.reduce((entropy, count) => {
    if (count === 0 || chromaticPixelCount === 0) return entropy;
    const probability = count / chromaticPixelCount;
    return entropy - probability * Math.log2(probability);
  }, 0);
  const mean = (values) =>
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const fieldInteriorGradientP90 =
    fieldInteriorGradientValues[
      Math.min(
        fieldInteriorGradientValues.length - 1,
        Math.max(0, Math.floor((fieldInteriorGradientValues.length - 1) * 0.9)),
      )
    ] ?? 0;
  const sortedFieldInteriorValues = [...fieldInteriorValues].sort(
    (left, right) => left - right,
  );
  const fieldInteriorPercentile = (percentile) =>
    sortedFieldInteriorValues[
      Math.min(
        sortedFieldInteriorValues.length - 1,
        Math.max(
          0,
          Math.floor((sortedFieldInteriorValues.length - 1) * percentile),
        ),
      )
    ] ?? 0;
  const fieldInteriorLuminanceP10 = fieldInteriorPercentile(0.1);
  const fieldInteriorLuminanceP90 = fieldInteriorPercentile(0.9);
  const fieldInteriorLuminanceStdDev = standardDeviation(fieldInteriorValues);
  const fieldInteriorGradientMean = mean(fieldInteriorGradientValues);
  const fieldInteriorPeakToValleyRatio =
    fieldInteriorLuminanceP90 /
    Math.max(fieldInteriorLuminanceP10, ACTIVE_LUMINANCE_THRESHOLD);
  const fieldInteriorRelativeVariation =
    fieldInteriorLuminanceStdDev /
    Math.max(fieldInteriorLuminanceP90, ACTIVE_LUMINANCE_THRESHOLD);
  const fieldInteriorRelativeGradient =
    fieldInteriorGradientMean /
    Math.max(fieldInteriorLuminanceP90, ACTIVE_LUMINANCE_THRESHOLD);
  const fieldInteriorDarkRatio =
    fieldInteriorValues.filter((value) => value < 0.035).length /
    Math.max(1, fieldInteriorValues.length);
  const fieldInteriorActiveRatio =
    fieldInteriorValues.filter((value) => value > ACTIVE_LUMINANCE_THRESHOLD)
      .length / Math.max(1, fieldInteriorValues.length);

  const luminousTopology = measureLuminousComponentTopology({
    gridValues: topologyGridValues,
    gridWidth,
    gridHeight,
    sampleStride,
    coverage: 0.1,
  });
  const continuityTopology = measureLuminousComponentTopology({
    gridValues: topologyGridValues,
    gridWidth,
    gridHeight,
    sampleStride,
    coverage: 0.5,
  });
  const metrics = {
    playbackTimeSeconds,
    p50,
    p98,
    nonblankRatio: nonblackCount / luminance.length,
    negativeSpaceRatio: negativeSpaceCount / luminance.length,
    broadWashRatio: broadWashCount / luminance.length,
    brightActiveRatio:
      nonblackCount === 0 ? 0 : brightActiveCount / nonblackCount,
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
    fieldInteriorLuminanceStdDev,
    fieldInteriorGradientMean,
    fieldInteriorGradientP90,
    fieldInteriorLaplacianMean: mean(fieldInteriorLaplacianValues),
    fieldInteriorLuminanceP10,
    fieldInteriorLuminanceP90,
    fieldInteriorPeakToValleyRatio,
    fieldInteriorRelativeVariation,
    fieldInteriorRelativeGradient,
    fieldInteriorDarkRatio,
    fieldInteriorActiveRatio,
    contrastRatio: p98 / Math.max(p50, 1e-4),
    chromaticPixelRatio: chromaticPixelCount / luminance.length,
    activeMeanSaturation:
      nonblackCount === 0 ? 0 : activeSaturationTotal / nonblackCount,
    activeMeanChroma:
      nonblackCount === 0 ? 0 : activeChromaTotal / nonblackCount,
    activeMeanFixedLightnessChroma:
      nonblackCount === 0 ? 0 : activeFixedLightnessChromaTotal / nonblackCount,
    visibleHueFamilyCount,
    dominantHueFamilyRatio,
    spatialHueEntropyBits,
    ...luminousTopology,
    continuityTopologyCoverage: continuityTopology.luminousTopologyCoverage,
    continuityComponentCount: continuityTopology.luminousComponentCount,
    continuitySmallComponentCount:
      continuityTopology.smallLuminousComponentCount,
    continuityMedianComponentAreaPx:
      continuityTopology.medianLuminousComponentAreaPx,
    continuityLargestComponentAreaRatio:
      continuityTopology.largestLuminousComponentAreaRatio,
  };

  if (artifactPath) {
    await writeFile(artifactPath, screenshotPng);
  }

  return metrics;
}

async function readCanvasSpectralWindowMetrics(page) {
  const canvas = page.locator("#root > div canvas").first();
  await expect(canvas).toBeVisible();
  const screenshotPng = await canvas.screenshot({
    style:
      '#root button, #root input, #root [role="button"], #root [role="status"] { visibility: hidden !important; }',
  });
  const playbackTimeSeconds = await page.evaluate(() =>
    Number(
      document.querySelector('input[aria-label="Playback position"]')?.value ??
        Number.NaN,
    ),
  );
  const {
    data,
    info: { width, height },
  } = await sharp(screenshotPng)
    .resize({ width: 256, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hueFamilyCounts = new Array(HUE_FAMILY_COUNT).fill(0);
  let activePixelCount = 0;
  let chromaticPixelCount = 0;
  let activeSaturationTotal = 0;
  let activeFixedLightnessChromaTotal = 0;
  let brightLowSaturationPixelCount = 0;
  let nearWhitePixelCount = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    const red = (data[offset] / 255) * alpha;
    const green = (data[offset + 1] / 255) * alpha;
    const blue = (data[offset + 2] / 255) * alpha;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (maximum >= 0.72 && saturation < 0.32) {
      brightLowSaturationPixelCount += 1;
    }
    if (maximum >= 0.78 && saturation < 0.22) {
      nearWhitePixelCount += 1;
    }
    if (luminance <= ACTIVE_LUMINANCE_THRESHOLD) continue;

    const oklab = displayRgbToOklab(red, green, blue);
    const perceptualChroma = Math.hypot(oklab.a, oklab.b);
    const fixedLightnessChroma =
      (perceptualChroma * SPECTRAL_COLORIMETRY_REFERENCE.targetOklabLightness) /
      Math.max(oklab.lightness, 1e-6);
    activePixelCount += 1;
    activeSaturationTotal += saturation;
    activeFixedLightnessChromaTotal += fixedLightnessChroma;
    if (saturation >= 0.18 && maximum >= 0.055) {
      let hue = Math.atan2(oklab.b, oklab.a) / (2 * Math.PI);
      if (hue < 0) hue += 1;
      hueFamilyCounts[Math.floor(hue * HUE_FAMILY_COUNT) % HUE_FAMILY_COUNT] +=
        1;
      chromaticPixelCount += 1;
    }
  }

  const visibleFamilyThreshold = Math.max(
    1,
    Math.ceil(chromaticPixelCount * 0.05),
  );
  const spatialHueEntropyBits = hueFamilyCounts.reduce((entropy, count) => {
    if (count === 0 || chromaticPixelCount === 0) return entropy;
    const probability = count / chromaticPixelCount;
    return entropy - probability * Math.log2(probability);
  }, 0);
  const pixelCount = Math.max(1, width * height);

  return {
    playbackTimeSeconds,
    activePixelRatio: activePixelCount / pixelCount,
    activeMeanSaturation: activeSaturationTotal / Math.max(1, activePixelCount),
    activeMeanFixedLightnessChroma:
      activeFixedLightnessChromaTotal / Math.max(1, activePixelCount),
    brightLowSaturationPixelRatio: brightLowSaturationPixelCount / pixelCount,
    nearWhitePixelRatio: nearWhitePixelCount / pixelCount,
    chromaticPixelRatio: chromaticPixelCount / pixelCount,
    visibleHueFamilyCount: hueFamilyCounts.filter(
      (count) => count >= visibleFamilyThreshold,
    ).length,
    spatialHueEntropyBits,
  };
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

function measureLuminousComponentTopology({
  gridValues,
  gridWidth,
  gridHeight,
  sampleStride,
  coverage,
}) {
  const centerX = (gridWidth - 1) * 0.5;
  const centerY = (gridHeight - 1) * 0.5;
  const radius = Math.min(gridWidth, gridHeight) * 0.3;
  const apertureValues = [];
  const aperture = new Uint8Array(gridValues.length);
  for (let index = 0; index < gridValues.length; index += 1) {
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    if (Math.hypot(x - centerX, y - centerY) <= radius) {
      aperture[index] = 1;
      apertureValues.push(gridValues[index]);
    }
  }
  apertureValues.sort((left, right) => left - right);
  const threshold = Math.max(
    ACTIVE_LUMINANCE_THRESHOLD,
    apertureValues[
      Math.max(0, Math.floor((apertureValues.length - 1) * (1 - coverage)))
    ] ?? 0,
  );
  const active = new Uint8Array(gridValues.length);
  for (let index = 0; index < gridValues.length; index += 1) {
    active[index] = aperture[index] && gridValues[index] >= threshold ? 1 : 0;
  }

  const visited = new Uint8Array(gridValues.length);
  const componentAreas = [];
  const componentPerimeters = [];
  const stack = [];
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) {
      continue;
    }
    let area = 0;
    let perimeter = 0;
    visited[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const current = stack.pop();
      const x = current % gridWidth;
      const y = Math.floor(current / gridWidth);
      area += 1;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (
          nextX < 0 ||
          nextX >= gridWidth ||
          nextY < 0 ||
          nextY >= gridHeight ||
          !active[nextY * gridWidth + nextX]
        ) {
          perimeter += 1;
        }
      }
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (
          nextX < 0 ||
          nextX >= gridWidth ||
          nextY < 0 ||
          nextY >= gridHeight
        ) {
          continue;
        }
        const next = nextY * gridWidth + nextX;
        if (active[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    componentAreas.push(area);
    componentPerimeters.push(perimeter);
  }

  const median = (values) => {
    if (values.length === 0) {
      return 0;
    }
    const ordered = [...values].sort((left, right) => left - right);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 === 0
      ? (ordered[middle - 1] + ordered[middle]) * 0.5
      : ordered[middle];
  };
  const areaScale = sampleStride * sampleStride;
  const totalArea = componentAreas.reduce((total, area) => total + area, 0);
  return {
    luminousTopologyCoverage: coverage,
    luminousTopologyThreshold: threshold,
    luminousComponentCount: componentAreas.length,
    smallLuminousComponentCount: componentAreas.filter((area) => area <= 16)
      .length,
    medianLuminousComponentAreaPx: median(componentAreas) * areaScale,
    medianLuminousComponentPerimeterPx:
      median(componentPerimeters) * sampleStride,
    largestLuminousComponentAreaRatio:
      totalArea === 0 ? 0 : Math.max(...componentAreas) / totalArea,
  };
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

async function seekPlaybackTimelineExactly(page, ratio) {
  const timeline = page.getByTestId("playback-timeline");
  await expect(timeline).toBeVisible();
  await timeline.evaluate((input, nextRatio) => {
    const value = Number(input.max) * nextRatio;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, ratio);
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

async function captureCurrentFieldAovSummary(page, descriptorId) {
  return page.evaluate(async (fixtureDescriptorId) => {
    const fixture = window.__baryonAuditFixture;
    const snapshot = await fixture.snapshotDescriptor({
      descriptorId: fixtureDescriptorId,
      viewPreset: "current-camera",
      output: { width: 512, height: 384 },
      checkpointMode: "current",
    });
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
      if (pixels instanceof Float32Array) return pixels;
      const decoded = new Float32Array(pixels.length);
      for (let index = 0; index < pixels.length; index += 1) {
        decoded[index] = halfToFloat(pixels[index]);
      }
      return decoded;
    };
    const summarize = (values) => {
      if (values.length === 0) {
        return {
          count: 0,
          mean: 0,
          relativeStdDev: 0,
          p50: 0,
          p90: 0,
          p98: 0,
          p99: 0,
        };
      }
      const sorted = values.toSorted((left, right) => left - right);
      const percentile = (fraction) =>
        sorted[
          Math.min(
            sorted.length - 1,
            Math.floor((sorted.length - 1) * fraction),
          )
        ];
      const mean =
        values.reduce((total, value) => total + value, 0) / values.length;
      const variance =
        values.reduce((total, value) => total + (value - mean) ** 2, 0) /
        values.length;
      return {
        count: values.length,
        mean,
        relativeStdDev: Math.sqrt(variance) / Math.max(mean, 1e-8),
        p50: percentile(0.5),
        p90: percentile(0.9),
        p98: percentile(0.98),
        p99: percentile(0.99),
      };
    };

    await fixture.install(snapshot.descriptor);
    try {
      const exported = await fixture.exportBuffers();
      const { width, height } = exported.checkpointAovs;
      const baseRadiance = decodeAov(exported.checkpointAovs.baseRadiance);
      const accentRadiance = decodeAov(exported.checkpointAovs.accentRadiance);
      const transmittance = decodeAov(exported.checkpointAovs.transmittance);
      const displayRgba = exported.displayRgba;
      const centerX = (width - 1) / 2;
      const centerY = (height - 1) / 2;
      const centerRadius = Math.min(width, height) * 0.32;
      const luminance = (red, green, blue) =>
        0.2126 * red + 0.7152 * green + 0.0722 * blue;

      const summarizeRegion = (centerOnly) => {
        const coverageValues = [];
        const opticalDepthValues = [];
        const integratedRadianceValues = [];
        const integratedPeakRadianceValues = [];
        const baseRadianceValues = [];
        const accentRadianceValues = [];
        const sourceFunctionValues = [];
        const sourceFunctionPeakValues = [];
        const displayLuminanceValues = [];
        let opticallyThickCount = 0;
        let opaqueCount = 0;
        let displayPlateCount = 0;
        let displayNearWhiteCount = 0;

        for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
          const x = pixelIndex % width;
          const y = Math.floor(pixelIndex / width);
          if (
            centerOnly &&
            Math.hypot(x - centerX, y - centerY) > centerRadius
          ) {
            continue;
          }
          const offset = pixelIndex * 4;
          const transmission = Math.min(
            1,
            Math.max(1e-8, transmittance[offset]),
          );
          const coverage = 1 - transmission;
          const baseRed = Math.max(0, baseRadiance[offset]);
          const baseGreen = Math.max(0, baseRadiance[offset + 1]);
          const baseBlue = Math.max(0, baseRadiance[offset + 2]);
          const accentRed = Math.max(0, accentRadiance[offset]);
          const accentGreen = Math.max(0, accentRadiance[offset + 1]);
          const accentBlue = Math.max(0, accentRadiance[offset + 2]);
          const base = luminance(baseRed, baseGreen, baseBlue);
          const accent = luminance(accentRed, accentGreen, accentBlue);
          const integratedRadiance = base + accent;
          const integratedPeakRadiance = Math.max(
            baseRed + accentRed,
            baseGreen + accentGreen,
            baseBlue + accentBlue,
          );
          if (coverage <= 0.01 || integratedPeakRadiance <= 1e-6) continue;
          const opticalDepth = -Math.log(transmission);
          const displayLuminance = luminance(
            displayRgba[offset] / 255,
            displayRgba[offset + 1] / 255,
            displayRgba[offset + 2] / 255,
          );

          coverageValues.push(coverage);
          opticalDepthValues.push(opticalDepth);
          integratedRadianceValues.push(integratedRadiance);
          integratedPeakRadianceValues.push(integratedPeakRadiance);
          baseRadianceValues.push(base);
          accentRadianceValues.push(accent);
          sourceFunctionValues.push(integratedRadiance / coverage);
          sourceFunctionPeakValues.push(integratedPeakRadiance / coverage);
          displayLuminanceValues.push(displayLuminance);
          if (opticalDepth >= -Math.log(0.1)) opticallyThickCount += 1;
          if (opticalDepth >= -Math.log(0.01)) opaqueCount += 1;
          if (displayLuminance >= 0.8) displayPlateCount += 1;
          if (displayLuminance >= 0.95) displayNearWhiteCount += 1;
        }

        const supportCount = coverageValues.length;
        return {
          supportCount,
          coverage: summarize(coverageValues),
          opticalDepth: summarize(opticalDepthValues),
          integratedRadiance: summarize(integratedRadianceValues),
          integratedPeakRadiance: summarize(integratedPeakRadianceValues),
          baseRadiance: summarize(baseRadianceValues),
          accentRadiance: summarize(accentRadianceValues),
          sourceFunctionProxy: summarize(sourceFunctionValues),
          sourceFunctionPeakProxy: summarize(sourceFunctionPeakValues),
          displayLuminance: summarize(displayLuminanceValues),
          opticallyThickRatio: opticallyThickCount / Math.max(1, supportCount),
          opaqueRatio: opaqueCount / Math.max(1, supportCount),
          displayPlateRatio: displayPlateCount / Math.max(1, supportCount),
          displayNearWhiteRatio:
            displayNearWhiteCount / Math.max(1, supportCount),
        };
      };

      return {
        descriptorHash: snapshot.descriptorHash,
        evaluationTimeSec: snapshot.descriptor.phase.evaluationTimeSec,
        activeModeCount: snapshot.descriptor.modal.activeModeCount,
        width,
        height,
        fullField: summarizeRegion(false),
        center: summarizeRegion(true),
      };
    } finally {
      if (fixture.status().phase === "installed") {
        await fixture.teardown();
      }
    }
  }, descriptorId);
}

async function capturePresentedCanvasMetricArtifact(page, testInfo, name) {
  const artifactPath = testInfo.outputPath(`${name}.png`);
  let metrics = await readCanvasLuminanceMetrics(page, artifactPath);
  if (metrics.nonblankRatio <= 0.01) {
    await awaitCanvasPresentation(page);
    metrics = await readCanvasLuminanceMetrics(page, artifactPath);
  }
  await testInfo.attach(name, {
    path: artifactPath,
    contentType: "image/png",
  });
  return metrics;
}

async function readPngMeanAbsoluteRgbDifference(leftPath, rightPath) {
  const left = await sharp(leftPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const right = await sharp(rightPath)
    .resize(left.info.width, left.info.height, {
      fit: "fill",
      kernel: "nearest",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  let sampleCount = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    total += Math.abs(left.data[index] - right.data[index]);
    total += Math.abs(left.data[index + 1] - right.data[index + 1]);
    total += Math.abs(left.data[index + 2] - right.data[index + 2]);
    sampleCount += 3;
  }
  return total / Math.max(1, sampleCount) / 255;
}

async function installCurrentFieldFixture(page, descriptorId) {
  const installed = await page.evaluate(async (fixtureDescriptorId) => {
    const deadline = performance.now() + 20_000;
    let snapshot = null;
    while (!snapshot && performance.now() < deadline) {
      try {
        snapshot = await window.__baryonAuditFixture.snapshotDescriptor({
          descriptorId: fixtureDescriptorId,
          viewPreset: "front",
          output: { width: 512, height: 384 },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        if (
          !message.includes("The live modal field authority is not complete")
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (!snapshot) {
      throw new Error(
        "Timed out waiting to freeze a complete live modal field authority.",
      );
    }
    const status = await window.__baryonAuditFixture.install(
      snapshot.descriptor,
    );
    return {
      descriptor: snapshot.descriptor,
      descriptorHash: snapshot.descriptorHash,
      status,
    };
  }, descriptorId);
  expect(installed.status.phase).toBe("installed");
  expect(installed.status.captureAllowed).toBe(true);
  expect(installed.status.descriptorHash).toBe(installed.descriptorHash);
  return installed;
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
          opticalFieldRepresentation:
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.opticalFieldRepresentation ?? null,
          radiationPotentialPacketReady:
            (window.__baryonAuditSnapshot?.raymarchDebug
              ?.radiationPotentialNormalizedEnergyNorm ?? 0) >= 0.999,
          modalDescriptorFieldAuthority:
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.modalDescriptorFieldAuthority ?? null,
          fixtureBridge: typeof window.__baryonAuditFixture,
        })),
      { timeout: 20_000 },
    )
    .toEqual({
      backend: "WebGPUBackend",
      fieldState: "test",
      volumeVisible: true,
      opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      radiationPotentialPacketReady: true,
      modalDescriptorFieldAuthority: "complete",
      fixtureBridge: "object",
    });

  return installCurrentFieldFixture(page, descriptorId);
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
        brightActiveRatio: expect.any(Number),
        brightPlateRatio: expect.any(Number),
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
          plasmaProbePreBloomRadiance: debug.plasmaProbePreBloomRadiance,
          plasmaProbeBaseRadiance: debug.plasmaProbeBaseRadiance,
          gain: debug.plasmaRadianceGain,
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
    // The cymascope carrier is a broad brilliant lace, not a quiet accent
    // over a dim base; the bright-lane ceiling admits the reference look
    // while still rejecting a full-disk plate. Production camera motion can
    // raise this share slightly above the frozen top-down sweep ceiling while
    // the independent wash, plate, and near-white guards remain authoritative.
    expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.17);
    expect(metrics.contrastRatio).toBeGreaterThanOrEqual(5.0);
    expect(metrics.broadWashRatio).toBeLessThan(0.24);
    expect(metrics.centralConnectedNonblackRatio).toBeGreaterThanOrEqual(0.02);
    expect(metrics.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(metrics.nonblankRatio, 1e-6),
    );
  });

  test("demo shortcut reaches its first visible field promptly", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);

    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            backend: window.__baryonRendererInfo?.backend ?? null,
            isFallback: window.__baryonRendererInfo?.isFallback ?? null,
          })),
        { timeout: 30_000 },
      )
      .toEqual({
        backend: "WebGPUBackend",
        isFallback: false,
      });

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await page.evaluate(() => {
      window.__baryonDemoFirstFieldProbeStartedAt = performance.now();
    });
    await playButton.click();

    const startup = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const startedAt =
            window.__baryonDemoFirstFieldProbeStartedAt ?? performance.now();
          const milestones = {};
          const mark = (name, condition) => {
            if (condition && milestones[name] == null) {
              milestones[name] = performance.now() - startedAt;
            }
          };
          const poll = () => {
            const snapshot = window.__baryonAuditSnapshot ?? {};
            const debug = snapshot.raymarchDebug ?? {};
            mark(
              "sourceActiveMs",
              snapshot.sourceSession?.kind === "file" &&
                snapshot.sourceSession?.phase === "active",
            );
            mark("fieldActiveMs", debug.fieldState === "active");
            mark(
              "modalEnergyMs",
              (debug.radiationPotentialObservedCoefficientEnergy ?? 0) > 0,
            );
            mark("materialVisibleMs", debug.materialOutputVisible === true);
            if (milestones.materialVisibleMs != null) {
              resolve({
                milestones,
                timedOut: false,
                workerFastLaneMaxMs:
                  snapshot.audioDiagnostics?.runtime?.engine
                    ?.workerFastLaneMaxMs ?? null,
                workerStructuralLaneMaxMs:
                  snapshot.audioDiagnostics?.runtime?.engine
                    ?.workerStructuralLaneMaxMs ?? null,
              });
              return;
            }
            if (performance.now() - startedAt >= 10_000) {
              resolve({
                milestones,
                timedOut: true,
                fieldState: debug.fieldState ?? null,
                blockedReason: debug.visibilityGateBlockedReason ?? null,
              });
              return;
            }
            requestAnimationFrame(poll);
          };
          poll();
        }),
    );
    console.log("demo-first-visible-field-startup", startup);
    expect(startup.timedOut).toBe(false);
    expect(startup.milestones.materialVisibleMs).toBeLessThan(2_000);
    await awaitCanvasPresentation(page);
    const metrics = await readCanvasLuminanceMetrics(page);
    console.log("demo-first-visible-field", startup, metrics);

    expect(metrics.nonblankRatio).toBeGreaterThan(0.01);
  });

  test("production demo appearance stays legible through representative playback", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "bloomEnabled", false);

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          sourceKind: window.__baryonAuditSnapshot?.sourceSession?.kind ?? null,
          sourcePhase:
            window.__baryonAuditSnapshot?.sourceSession?.phase ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        sourceKind: "file",
        sourcePhase: "active",
        fieldState: "active",
        volumeVisible: true,
      });

    const pauseButton = page.getByRole("button", {
      name: "Pause",
      exact: true,
    });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    const electricPlasmaCheckpoint = 43 / 254;
    const observations = [];
    for (const checkpoint of [0.03, 0.1, electricPlasmaCheckpoint, 0.25, 0.5]) {
      await seekPlaybackTimelineExactly(page, checkpoint);
      await page.waitForTimeout(1_200);
      await awaitCanvasPresentation(page);
      // Seeking briefly preserves the previously presented canvas while the
      // audio worker rebuilds its packet. Wait for the requested musical field,
      // not merely any nonblank retained frame.
      await expect
        .poll(async () => (await readCanvasLuminanceMetrics(page)).p98, {
          timeout: 20_000,
        })
        .toBeGreaterThan(0.08);
      const metrics = await captureCanvasMetricArtifact(
        page,
        testInfo,
        `production-demo-${Math.round(checkpoint * 100)}pct`,
      );
      const diagnostics = await page.evaluate(() => {
        const controls = window.__baryonControls?.getState?.() ?? {};
        const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
        return {
          bloomStrength: controls.bloomStrength ?? null,
          bloomRadius: controls.bloomRadius ?? null,
          bloomThreshold: controls.bloomThreshold ?? null,
          densityGain: controls.densityGain ?? null,
          holographicIntensity: controls.holographicIntensity ?? null,
          exposureDrive: debug.radiationPotentialExposureDrive ?? 0,
          observedCoefficientEnergy:
            debug.radiationPotentialObservedCoefficientEnergy ?? 0,
          bakeModeCount: debug.radiationPotentialBakeModeCount ?? 0,
          avgDensity: debug.avgDensity ?? 0,
          avgOpacity: debug.avgOpacity ?? 0,
          preBloomRadiance: debug.plasmaProbePreBloomRadiance ?? 0,
        };
      });
      observations.push({ checkpoint, diagnostics, metrics });
    }
    console.log("production-demo-appearance", observations);
    for (const { metrics } of observations) {
      // Musical checkpoints can land on a deliberately quiet phrase. Require
      // every frame to remain visible, then prove the sequence reaches a
      // photographic plasma peak below.
      expect(metrics.p98).toBeGreaterThanOrEqual(0.2);
      expect(metrics.p98).toBeLessThanOrEqual(0.86);
      expect(metrics.nonblankRatio).toBeLessThanOrEqual(0.55);
      expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.68);
      expect(metrics.broadWashRatio).toBeLessThan(0.16);
      // Hue and musical phase decide whether the hot spine reaches neutral
      // display white. Its area is bounded, but a white-pixel floor would
      // incorrectly make chromatic plasma fail.
      expect(metrics.nearWhitePixelRatio).toBeLessThan(0.12);
      // A full-volume observation need not contain camera-deleted black
      // pockets. Judge separation by the field's own valleys and peaks so an
      // occupied but structured depth volume passes while a uniform plate does
      // not.
      expect(metrics.fieldInteriorPeakToValleyRatio).toBeGreaterThanOrEqual(
        2.5,
      );
      expect(metrics.fieldInteriorActiveRatio).toBeGreaterThanOrEqual(0.12);
      expect(
        metrics.continuityLargestComponentAreaRatio,
      ).toBeGreaterThanOrEqual(0.88);
      expect(metrics.fieldInteriorRelativeVariation).toBeGreaterThanOrEqual(
        0.25,
      );
      expect(metrics.fieldInteriorRelativeGradient).toBeGreaterThanOrEqual(
        0.07,
      );
      // Electric filaments may legitimately push much of the active carrier
      // above display mid-gray. The full-frame negative-space, broad-wash,
      // valley, and variation gates above remain the plate rejection owners.
      expect(metrics.brightPlateRatio).toBeLessThanOrEqual(0.6);
      expect(metrics.fieldInteriorDarkRatio).toBeGreaterThanOrEqual(0.04);
    }
    const electricPlasmaMetrics = observations.find(
      ({ checkpoint }) => checkpoint === electricPlasmaCheckpoint,
    )?.metrics;
    expect(electricPlasmaMetrics).toBeDefined();
    expect(electricPlasmaMetrics.p98).toBeGreaterThanOrEqual(0.46);
    expect(electricPlasmaMetrics.brightLaneRatio).toBeGreaterThanOrEqual(0.05);
    expect(electricPlasmaMetrics.activeMeanSaturation).toBeGreaterThanOrEqual(
      0.48,
    );
    expect(electricPlasmaMetrics.broadWashRatio).toBeLessThan(0.14);
    expect(electricPlasmaMetrics.nearWhitePixelRatio).toBeLessThan(0.02);
    expect(
      Math.max(...observations.map(({ metrics }) => metrics.p98)),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      Math.max(
        ...observations.map(({ metrics }) => metrics.activeMeanSaturation),
      ),
    ).toBeGreaterThanOrEqual(0.36);
  });

  test("production demo 2:13 passage keeps complete plasma support from the side without bloom", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "bloomEnabled", false);

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          sourceKind: window.__baryonAuditSnapshot?.sourceSession?.kind ?? null,
          sourcePhase:
            window.__baryonAuditSnapshot?.sourceSession?.phase ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        sourceKind: "file",
        sourcePhase: "active",
        fieldState: "active",
        volumeVisible: true,
      });

    await seekPlaybackTimeline(page, 133 / 254);
    await page.waitForTimeout(800);
    const pauseButton = page.getByRole("button", {
      name: "Pause",
      exact: true,
    });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();
    await page.waitForTimeout(400);
    await setCameraPose(page, {
      position: { x: 8.53, y: 0.78, z: 1.31 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 65,
    });
    await awaitCanvasPresentation(page);
    const metrics = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-2m13s-side-bloom-off",
    );
    console.log("production-demo-2m13s-side-bloom-off", metrics);
    await page.waitForTimeout(1_200);
    await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-2m13s-side-bloom-off-paused-hold",
    );
    const pausedDisplayDrift = await readPngMeanAbsoluteRgbDifference(
      testInfo.outputPath("production-demo-2m13s-side-bloom-off.png"),
      testInfo.outputPath(
        "production-demo-2m13s-side-bloom-off-paused-hold.png",
      ),
    );
    await setControl(page, "bloomEnabled", true);
    await page.waitForTimeout(200);
    await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-2m13s-side-bloom-on-paused",
    );
    await setControl(page, "bloomEnabled", false);
    await page.waitForTimeout(200);
    await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-2m13s-side-bloom-off-restored",
    );
    const pausedBloomDifference = await readPngMeanAbsoluteRgbDifference(
      testInfo.outputPath(
        "production-demo-2m13s-side-bloom-off-paused-hold.png",
      ),
      testInfo.outputPath("production-demo-2m13s-side-bloom-on-paused.png"),
    );
    const bloomRoundTripDrift = await readPngMeanAbsoluteRgbDifference(
      testInfo.outputPath(
        "production-demo-2m13s-side-bloom-off-paused-hold.png",
      ),
      testInfo.outputPath("production-demo-2m13s-side-bloom-off-restored.png"),
    );
    console.log("production-demo-paused-bloom-contract", {
      bloomRoundTripDrift,
      pausedBloomDifference,
      pausedDisplayDrift,
    });

    expect(metrics.p98).toBeGreaterThanOrEqual(0.38);
    expect(metrics.nonblankRatio).toBeGreaterThanOrEqual(0.08);
    expect(metrics.centralConnectedNonblackRatio).toBeGreaterThanOrEqual(0.3);
    expect(metrics.fieldInteriorActiveRatio).toBeGreaterThanOrEqual(0.7);
    expect(metrics.fieldInteriorDarkRatio).toBeGreaterThanOrEqual(0.08);
    expect(metrics.fieldInteriorDarkRatio).toBeLessThanOrEqual(0.38);
    expect(metrics.activeMeanSaturation).toBeGreaterThanOrEqual(0.3);
    expect(metrics.continuityLargestComponentAreaRatio).toBeGreaterThanOrEqual(
      0.9,
    );
    expect(metrics.broadWashRatio).toBeLessThanOrEqual(0.16);
    expect(metrics.brightPlateRatio).toBeLessThanOrEqual(0.35);
    expect(pausedDisplayDrift).toBeLessThan(1e-3);
    expect(pausedBloomDifference).toBeGreaterThan(1e-4);
    expect(bloomRoundTripDrift).toBeLessThan(1e-3);
  });

  test("production demo 3:24 passage preserves local plasma contrast without bloom", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "bloomEnabled", false);

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const session = window.__baryonAuditSnapshot?.sourceSession;
            return `${session?.kind ?? "none"}:${session?.phase ?? "none"}`;
          }),
        { timeout: 20_000 },
      )
      .toBe("file:active");

    await seekPlaybackTimeline(page, 204 / 254);
    await page.waitForTimeout(800);
    const pauseButton = page.getByRole("button", {
      name: "Pause",
      exact: true,
    });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();
    await page.waitForTimeout(400);
    await awaitCanvasPresentation(page);

    const metrics = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-3m24s-local-contrast-bloom-off",
    );

    expect(metrics.p98).toBeGreaterThanOrEqual(0.38);
    expect(metrics.fieldInteriorRelativeVariation).toBeGreaterThanOrEqual(0.24);
    expect(metrics.fieldInteriorRelativeGradient).toBeGreaterThanOrEqual(0.12);
    expect(metrics.broadWashRatio).toBeLessThanOrEqual(0.16);
    expect(metrics.brightPlateRatio).toBeLessThanOrEqual(0.35);
    expect(metrics.nearWhitePixelRatio).toBeLessThanOrEqual(0.02);
  });

  test("continuous demo playback exposes the live early dense passage", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(
      process.env.BARYON_CONTINUOUS_EXPOSURE_CAPTURE !== "1",
      "manual uninterrupted-playback calibration lane",
    );
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "densityGain", 4);
    await setControl(page, "raymarchSteps", 80);
    await setControl(page, "holographicFresnelPower", 8);
    await setControl(page, "bloomEnabled", true);
    await setControl(page, "bloomStrength", 0.9);
    await setControl(page, "bloomRadius", 0);
    await setControl(page, "bloomThreshold", 0.36);
    await setControl(page, "renderQualityPreset", "max-quality");
    await setCameraPose(page, {
      position: { x: 4.07, y: 4.07, z: 4.07 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 65,
    });

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const session = window.__baryonAuditSnapshot?.sourceSession;
            return `${session?.kind ?? "none"}:${session?.phase ?? "none"}`;
          }),
        { timeout: 20_000 },
      )
      .toBe("file:active");

    const timeline = page.getByTestId("playback-timeline");
    const tailStart = await page.evaluate(() =>
      window.__baryonTailDiagnostics?.start?.(),
    );
    expect(tailStart?.active).toBe(true);
    const captureStartSeconds = Number(await timeline.inputValue());
    const observations = [];
    for (const checkpointOffsetSeconds of [
      3, 6, 9, 12, 15, 18, 21, 24, 27, 30,
    ]) {
      const checkpointSeconds = captureStartSeconds + checkpointOffsetSeconds;
      await expect
        .poll(async () => Number(await timeline.inputValue()), {
          timeout: 40_000,
        })
        .toBeGreaterThanOrEqual(checkpointSeconds);
      const metrics = await captureCanvasMetricArtifact(
        page,
        testInfo,
        `production-demo-continuous-${checkpointOffsetSeconds}s-live-controls`,
      );
      const diagnostic = await page.evaluate(() => {
        const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
        const tail = window.__baryonTailDiagnostics?.dump?.();
        return {
          audioSeconds: Number(
            document.querySelector('[data-testid="playback-timeline"]')
              ?.value ?? 0,
          ),
          tailElapsedMs: tail?.samples?.at(-1)?.tMs ?? null,
          totalSlotAmplitude: debug.totalSlotAmplitude ?? 0,
          structuralProjectionDrive: debug.structuralProjectionDrive ?? 0,
          structuralProjectionConcentration:
            debug.structuralProjectionConcentration ?? 0,
          observedCoefficientEnergy:
            debug.radiationPotentialObservedCoefficientEnergy ?? 0,
          exposureDrive: debug.radiationPotentialExposureDrive ?? 0,
          plasmaProbeLocalRadiance: debug.plasmaProbeLocalRadiance ?? 0,
          plasmaProbeOrganizedDensity: debug.plasmaProbeOrganizedDensity ?? 0,
          plasmaProbeExtinction: debug.plasmaProbeExtinction ?? 0,
          plasmaProbePreBloomRadiance: debug.plasmaProbePreBloomRadiance ?? 0,
          plasmaProbePostBloomRisk: debug.plasmaProbePostBloomRisk ?? 0,
          plasmaProbeBloomAmplification:
            debug.plasmaProbeBloomAmplification ?? 1,
          continuitySpineRadianceAllocation:
            debug.plasmaProbeContinuitySpineRadianceAllocation ?? 0,
          detailSpineRadianceAllocation:
            debug.plasmaProbeDetailSpineRadianceAllocation ?? 0,
          bodyRadianceAllocation: debug.plasmaProbeBodyRadianceAllocation ?? 0,
          avgDensity: debug.avgDensity ?? 0,
          avgOpacity: debug.avgOpacity ?? 0,
        };
      });
      const aovSummary = [21, 24].includes(checkpointOffsetSeconds)
        ? await captureCurrentFieldAovSummary(
            page,
            `production-demo-continuous-${checkpointOffsetSeconds}s-aov`,
          )
        : null;
      observations.push({
        checkpointOffsetSeconds,
        ...diagnostic,
        metrics,
        aovSummary,
      });
    }

    const tailDiagnostics = await page.evaluate(() =>
      window.__baryonTailDiagnostics?.stop?.(),
    );
    expect(tailDiagnostics?.active).toBe(false);
    expect(tailDiagnostics?.samples?.length ?? 0).toBeGreaterThanOrEqual(100);
    const diagnosticArtifactPath = testInfo.outputPath(
      "production-demo-continuous-30s-diagnostics.json",
    );
    await writeFile(
      diagnosticArtifactPath,
      JSON.stringify(
        {
          captureStartSeconds,
          observations,
          tailDiagnostics,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("production-demo-continuous-30s-diagnostics", {
      path: diagnosticArtifactPath,
      contentType: "application/json",
    });

    console.log(
      "production-demo-continuous-exposure",
      JSON.stringify({
        observations,
        tailSummary: tailDiagnostics.windowSummary,
      }),
    );
  });

  test("live demo 3:24 passage exports current-field optical depth", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      process.env.BARYON_CONTINUOUS_EXPOSURE_CAPTURE !== "1",
      "manual uninterrupted-playback calibration lane",
    );
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "densityGain", 4);
    await setControl(page, "raymarchSteps", 80);
    await setControl(page, "holographicFresnelPower", 8);
    await setControl(page, "bloomEnabled", true);
    await setControl(page, "bloomStrength", 0.9);
    await setControl(page, "bloomRadius", 0);
    await setControl(page, "bloomThreshold", 0.36);
    await setControl(page, "renderQualityPreset", "max-quality");
    await setCameraPose(page, {
      position: { x: 4.07, y: 4.07, z: 4.07 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 65,
    });

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const session = window.__baryonAuditSnapshot?.sourceSession;
            return `${session?.kind ?? "none"}:${session?.phase ?? "none"}`;
          }),
        { timeout: 20_000 },
      )
      .toBe("file:active");

    const durationSeconds = 254;
    await seekPlaybackTimeline(page, 199 / durationSeconds);
    const timeline = page.getByTestId("playback-timeline");
    await expect
      .poll(async () => Number(await timeline.inputValue()), {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(204);
    const metrics = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "production-demo-live-3m24s",
    );
    const aovSummary = await captureCurrentFieldAovSummary(
      page,
      "production-demo-live-3m24s-aov",
    );
    const artifactPath = testInfo.outputPath(
      "production-demo-live-3m24s-diagnostics.json",
    );
    await writeFile(
      artifactPath,
      JSON.stringify(
        {
          audioSeconds: Number(await timeline.inputValue()),
          metrics,
          aovSummary,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("production-demo-live-3m24s-diagnostics", {
      path: artifactPath,
      contentType: "application/json",
    });
    console.log(
      "production-demo-live-3m24s",
      JSON.stringify({ metrics, aovSummary }),
    );
  });

  test("observer exposure calibration scans fixed demo timestamps", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      process.env.BARYON_OBSERVER_CALIBRATION_CAPTURE !== "1",
      "manual fixed-apparatus calibration lane",
    );
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);

    const playButton = page.getByRole("button", {
      name: "Play demo audio",
      exact: true,
    });
    await page.locator(".am-compact-card").hover();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await playButton.click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const session = window.__baryonAuditSnapshot?.sourceSession;
            return `${session?.kind ?? "none"}:${session?.phase ?? "none"}`;
          }),
        { timeout: 20_000 },
      )
      .toBe("file:active");
    await awaitCanvasPresentation(page);
    const pauseButton = page.getByRole("button", {
      name: "Pause",
      exact: true,
    });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    const observations = [];
    const durationSeconds = 254;
    const checkpointsSeconds = [
      12, 25, 40, 55, 70, 85, 100, 115, 130, 145, 160, 175, 190, 200, 205, 220,
      235, 250,
    ];
    for (const [bloomLabel, bloomEnabled] of [
      ["bloom-off", false],
      ["bloom-on", true],
    ]) {
      await setControl(page, "bloomEnabled", bloomEnabled);
      for (const checkpointSeconds of checkpointsSeconds) {
        const checkpoint = checkpointSeconds / durationSeconds;
        await seekPlaybackTimelineExactly(page, checkpoint);
        await page.waitForTimeout(500);
        await awaitCanvasPresentation(page);
        await expect
          .poll(async () => (await readCanvasLuminanceMetrics(page)).p98, {
            timeout: 20_000,
          })
          .toBeGreaterThan(0.08);
        const metrics = await captureCanvasMetricArtifact(
          page,
          testInfo,
          `observer-exposure-${bloomLabel}-${checkpointSeconds}s`,
        );
        observations.push({
          bloomEnabled,
          checkpointSeconds,
          checkpoint,
          p50: metrics.p50,
          p98: metrics.p98,
          negativeSpaceRatio: metrics.negativeSpaceRatio,
          broadWashRatio: metrics.broadWashRatio,
          brightPlateRatio: metrics.brightPlateRatio,
          nearWhitePixelRatio: metrics.nearWhitePixelRatio,
          brightLowSaturationPixelRatio: metrics.brightLowSaturationPixelRatio,
          activeMeanSaturation: metrics.activeMeanSaturation,
          activeMeanChroma: metrics.activeMeanChroma,
          fieldInteriorDarkRatio: metrics.fieldInteriorDarkRatio,
          fieldInteriorRelativeVariation:
            metrics.fieldInteriorRelativeVariation,
          fieldInteriorRelativeGradient: metrics.fieldInteriorRelativeGradient,
          continuityLargestComponentAreaRatio:
            metrics.continuityLargestComponentAreaRatio,
        });
      }
    }

    console.log("observer-exposure-calibration", JSON.stringify(observations));
  });

  test("shipping appearance keeps the filament carrier legible without bloom", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const controls = window.__baryonControls?.getState?.() ?? {};
          return {
            bloomEnabled: controls.bloomEnabled ?? null,
            bloomStrength: controls.bloomStrength ?? null,
            bloomRadius: controls.bloomRadius ?? null,
            bloomThreshold: controls.bloomThreshold ?? null,
            backend: window.__baryonRendererInfo?.backend ?? null,
            volumeVisible:
              window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ??
              false,
          };
        }),
      )
      .toEqual({
        bloomEnabled: true,
        bloomStrength: 0.3,
        bloomRadius: 0.02,
        bloomThreshold: 0.72,
        backend: "WebGPUBackend",
        volumeVisible: true,
      });
    await setControl(page, "bloomEnabled", false);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControls?.getState?.().bloomEnabled ?? null,
        ),
      )
      .toBe(false);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await installCurrentFieldFixture(page, "shipping-energy-plasma");
    await awaitCanvasPresentation(page);
    // Let the deterministic tone field replace any startup or idle history
    // before judging the bloom-independent carrier.
    await page.waitForTimeout(1_800);

    const sharp = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "shipping-energy-sharp",
    );
    console.log("raymarch-shipping-energy-sharp", { sharp });

    expect(sharp.p98).toBeGreaterThanOrEqual(0.48);
    expect(sharp.p98).toBeLessThanOrEqual(0.9);
    expect(sharp.negativeSpaceRatio).toBeGreaterThanOrEqual(0.75);
    expect(sharp.broadWashRatio).toBeLessThan(0.14);
    expect(sharp.activeMeanSaturation).toBeGreaterThan(0.38);
    expect(sharp.activeMeanChroma).toBeGreaterThan(0.24);
    expect(sharp.brightLowSaturationPixelRatio).toBeLessThan(0.08);
    expect(sharp.fieldInteriorLuminanceStdDev).toBeGreaterThanOrEqual(0.16);
    expect(sharp.fieldInteriorPeakToValleyRatio).toBeGreaterThanOrEqual(2.7);
    expect(sharp.brightLaneRatio).toBeGreaterThanOrEqual(0.045);
    expect(sharp.brightLaneRatio).toBeLessThanOrEqual(0.16);
    expect(sharp.brightPlateRatio).toBeLessThanOrEqual(0.4);
    expect(sharp.fieldInteriorDarkRatio).toBeGreaterThanOrEqual(0.08);
    // Analytic interval integration keeps the narrowed spine coherent. These
    // bounds leave room for deliberate filament edges while still rejecting
    // stochastic march grain and sub-cache stippling.
    expect(sharp.fineLatticePressure).toBeLessThanOrEqual(0.09);
    expect(sharp.fieldInteriorLaplacianMean).toBeLessThanOrEqual(0.4);
    expect(sharp.continuityLargestComponentAreaRatio).toBeGreaterThanOrEqual(
      0.9,
    );
  });

  test("production bloom spans restrained defaults and the full control domain", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const controls = window.__baryonControls?.getState?.() ?? {};
          return {
            bloomEnabled: controls.bloomEnabled ?? null,
            bloomStrength: controls.bloomStrength ?? null,
            bloomRadius: controls.bloomRadius ?? null,
            bloomThreshold: controls.bloomThreshold ?? null,
            backend: window.__baryonRendererInfo?.backend ?? null,
            volumeVisible:
              window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ??
              false,
          };
        }),
      )
      .toEqual({
        bloomEnabled: true,
        bloomStrength: 0.3,
        bloomRadius: 0.02,
        bloomThreshold: 0.72,
        backend: "WebGPUBackend",
        volumeVisible: true,
      });

    await setControl(page, "freezeModeSlots", true);
    await setControl(page, "bloomEnabled", false);
    await page.waitForTimeout(900);
    await awaitCanvasPresentation(page);
    const sharp = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "shipping-energy-bloom-off",
    );

    await setControl(page, "bloomEnabled", true);
    await page.waitForTimeout(900);
    const glow = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "shipping-energy-default-glow",
    );

    await setControl(page, "bloomStrength", 1.2);
    await setControl(page, "bloomRadius", 0.35);
    await setControl(page, "bloomThreshold", 0.15);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const controls = window.__baryonControls?.getState?.() ?? {};
          return {
            bloomStrength: controls.bloomStrength ?? null,
            bloomRadius: controls.bloomRadius ?? null,
            bloomThreshold: controls.bloomThreshold ?? null,
          };
        }),
      )
      .toEqual({
        bloomStrength: 1.2,
        bloomRadius: 0.35,
        bloomThreshold: 0.15,
      });
    await page.waitForTimeout(900);
    const fullDomainGlow = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "shipping-energy-full-domain-glow",
    );

    const bloomOffPath = testInfo.outputPath("shipping-energy-bloom-off.png");
    const defaultPixelDifference = await readPngMeanAbsoluteRgbDifference(
      bloomOffPath,
      testInfo.outputPath("shipping-energy-default-glow.png"),
    );
    const fullDomainPixelDifference = await readPngMeanAbsoluteRgbDifference(
      bloomOffPath,
      testInfo.outputPath("shipping-energy-full-domain-glow.png"),
    );
    console.log("raymarch-production-bloom", {
      defaultPixelDifference,
      fullDomainGlow,
      fullDomainPixelDifference,
      glow,
      sharp,
    });

    // The shipping calibration remains an enhancer, while the exposed domain
    // must retain unmistakable creative authority in the live compositor.
    expect(defaultPixelDifference).toBeGreaterThan(0.001);
    expect(defaultPixelDifference).toBeLessThan(0.03);
    expect(fullDomainPixelDifference).toBeGreaterThan(0.05);
    expect(fullDomainPixelDifference).toBeGreaterThan(
      defaultPixelDifference + 0.04,
    );
  });

  test("WebGL2 preserves the cymatic observer and plasma semantic envelope", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(browserName !== "chromium", "backend parity is chromium-only");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "idleLogoIntensity", 0);
    await setControl(page, "bloomEnabled", false);
    await setControl(page, "traaEnabled", false);
    await setControl(page, "smaaEnabled", false);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "testToneAmplitude", 0.5);

    const awaitBackendField = async (isFallback) => {
      await expect
        .poll(
          () =>
            page.evaluate(() => ({
              isFallback: window.__baryonRendererInfo?.isFallback ?? false,
              fieldState:
                window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
              volumeVisible:
                window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ??
                false,
            })),
          { timeout: 30_000 },
        )
        .toEqual({
          isFallback,
          fieldState: "test",
          volumeVisible: true,
        });
      await awaitCanvasPresentation(page);
      await page.waitForTimeout(900);
    };

    await awaitBackendField(false);
    const webgpu = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "webgpu-plasma-parity",
    );

    await setControl(page, "forceWebGLFallbackTest", true);
    await awaitBackendField(true);
    const webgl2 = await capturePresentedCanvasMetricArtifact(
      page,
      testInfo,
      "webgl2-plasma-parity",
    );
    console.log("raymarch-backend-semantic-parity", { webgpu, webgl2 });

    for (const metrics of [webgpu, webgl2]) {
      expect(metrics.p98).toBeGreaterThanOrEqual(0.48);
      expect(metrics.p98).toBeLessThanOrEqual(0.9);
      expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.75);
      expect(metrics.broadWashRatio).toBeLessThan(0.14);
      expect(metrics.activeMeanSaturation).toBeGreaterThanOrEqual(0.35);
      expect(
        metrics.continuityLargestComponentAreaRatio,
      ).toBeGreaterThanOrEqual(0.9);
    }
    expect(Math.abs(webgl2.p98 - webgpu.p98)).toBeLessThanOrEqual(0.15);
    expect(
      Math.abs(webgl2.activeMeanSaturation - webgpu.activeMeanSaturation),
    ).toBeLessThanOrEqual(0.15);
    expect(
      Math.abs(webgl2.negativeSpaceRatio - webgpu.negativeSpaceRatio),
    ).toBeLessThanOrEqual(0.05);
    expect(
      Math.abs(
        webgl2.fieldInteriorRelativeGradient -
          webgpu.fieldInteriorRelativeGradient,
      ),
    ).toBeLessThanOrEqual(0.08);
  });

  test("528 Hz tone stays structurally legible across input amplitudes", async ({
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
    await setControl(page, "rotationMode", "off");
    await setControl(page, "motionAmount", 0);
    await setControl(page, "injectTestTone", true);
    await setControl(page, "testToneHz", 528);
    await setControl(page, "idleLogoIntensity", 0);

    const waitForRadiationPotentialPacket = async (amplitude) => {
      const handle = await page.waitForFunction(
        ({ expectedAmplitude, expectedRepresentation }) => {
          const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
          const diagnostics = {
            observedCoefficientEnergy:
              debug.radiationPotentialObservedCoefficientEnergy ?? 0,
            normalizedEnergyNorm:
              debug.radiationPotentialNormalizedEnergyNorm ?? 0,
            modeCapacity: debug.radiationPotentialModeCapacity ?? 0,
            bakeModeCount: debug.radiationPotentialBakeModeCount ?? 0,
            exposureDrive: debug.radiationPotentialExposureDrive ?? 0,
          };
          const currentAmplitude =
            window.__baryonControls?.getState?.().testToneAmplitude ?? null;
          const ready =
            currentAmplitude === expectedAmplitude &&
            debug.fieldState === "test" &&
            debug.opticalFieldRepresentation === expectedRepresentation &&
            diagnostics.observedCoefficientEnergy > 0 &&
            Math.abs(diagnostics.normalizedEnergyNorm - 1) <= 1e-3 &&
            diagnostics.bakeModeCount > 0 &&
            diagnostics.exposureDrive > 0;
          return ready ? diagnostics : false;
        },
        {
          expectedAmplitude: amplitude,
          expectedRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
        },
        { timeout: 20_000 },
      );
      const diagnostics = await handle.jsonValue();
      await handle.dispose();
      return diagnostics;
    };

    const amplitudeFrames = [];
    for (const amplitude of [0.08, 0.25, 0.5, 1]) {
      await setControl(page, "testToneAmplitude", amplitude);
      await page.waitForTimeout(600);
      await waitForRadiationPotentialPacket(amplitude);

      const metrics = await captureCanvasMetricArtifact(
        page,
        testInfo,
        `photographic-amplitude-${String(amplitude).replace(".", "-")}`,
      );
      const diagnostics = await waitForRadiationPotentialPacket(amplitude);
      amplitudeFrames.push({ amplitude, diagnostics, metrics });
    }

    console.log("raymarch-amplitude-sweep", amplitudeFrames);
    for (const { diagnostics, metrics } of amplitudeFrames) {
      expect(diagnostics.observedCoefficientEnergy).toBeGreaterThan(0);
      expect(diagnostics.bakeModeCount).toBeGreaterThan(0);
      expect(diagnostics.bakeModeCount).toBeLessThanOrEqual(
        diagnostics.modeCapacity,
      );
      expect(diagnostics.normalizedEnergyNorm).toBeGreaterThanOrEqual(0.995);
      expect(diagnostics.exposureDrive).toBeGreaterThan(0);
      expect(metrics.p98).toBeGreaterThanOrEqual(0.08);
      expect(metrics.nonblankRatio).toBeGreaterThanOrEqual(0.04);
      expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.55);
      expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.01);
      expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.16);
      expect(metrics.contrastRatio).toBeGreaterThanOrEqual(4);
      expect(metrics.broadWashRatio).toBeLessThan(0.24);
      // Interior-variation floors are display-luminance-coupled and moved
      // with the 2026-07-28 base-gain re-sweep (step 13 -> 7): measured
      // stdDev 0.049, gradMean 0.026, gradP90 0.062, laplacian 0.065 across
      // all four amplitudes; floors sit at ~60% of measurement.
      expect(metrics.fieldInteriorLuminanceStdDev).toBeGreaterThanOrEqual(0.03);
      expect(metrics.fieldInteriorGradientMean).toBeGreaterThanOrEqual(0.016);
      expect(metrics.fieldInteriorGradientP90).toBeGreaterThanOrEqual(0.04);
      expect(metrics.fieldInteriorLaplacianMean).toBeGreaterThanOrEqual(0.04);
      expect(metrics.centralConnectedNonblackRatio).toBeGreaterThanOrEqual(
        0.02,
      );
      expect(metrics.nearWhitePixelRatio).toBeLessThan(
        0.08 * Math.max(metrics.nonblankRatio, 1e-6),
      );
    }
    await expect
      .poll(() => page.evaluate(() => window.__baryonPerfMetrics?.fps ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(24);
    console.log(
      "raymarch-radiation-potential-performance",
      await page.evaluate(() => ({
        fps: window.__baryonPerfMetrics?.fps ?? 0,
        smoothedFrameTimeMs:
          window.__baryonPerfMetrics?.smoothedFrameTimeMs ?? 0,
        effectiveRaymarchSteps:
          window.__baryonPerfMetrics?.render?.effectiveRaymarchSteps ?? null,
      })),
    );

    await setControl(page, "renderQualityPreset", "max-quality");
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              window.__baryonPerfMetrics?.render?.effectiveRaymarchSteps ?? 0,
          ),
        { timeout: 20_000 },
      )
      .toBe(OPTICAL_MEASUREMENT_CONTROLS.raymarchSteps);
    await expect
      .poll(() => page.evaluate(() => window.__baryonPerfMetrics?.fps ?? 0), {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(50);
    console.log(
      "raymarch-radiation-potential-max-quality-performance",
      await page.evaluate(() => ({
        fps: window.__baryonPerfMetrics?.fps ?? 0,
        smoothedFrameTimeMs:
          window.__baryonPerfMetrics?.smoothedFrameTimeMs ?? 0,
        effectiveRaymarchSteps:
          window.__baryonPerfMetrics?.render?.effectiveRaymarchSteps ?? null,
      })),
    );
  });

  test("40 cached-potential samples preserve the 104-sample structural reference", async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    const installed = await installFrozen528Fixture(
      page,
      "direct-analytic-sample-equivalence",
    );
    const referenceDescriptor = installed.descriptor;
    await page.evaluate(() => window.__baryonAuditFixture.teardown());

    const captures = [];
    for (const [index, steps] of [104, 40].entries()) {
      if (index > 0) {
        await page.evaluate(() => window.__baryonAuditFixture.teardown());
      }
      await page.evaluate(
        async ({ descriptor, raymarchSteps }) => {
          const candidate = structuredClone(descriptor);
          candidate.descriptorId = `direct-analytic-${raymarchSteps}-samples`;
          candidate.output.raymarchSteps = raymarchSteps;
          await window.__baryonAuditFixture.install(candidate);
        },
        { descriptor: referenceDescriptor, raymarchSteps: steps },
      );
      await page.waitForTimeout(1_200);
      captures.push({
        steps,
        metrics: await captureCanvasMetricArtifact(
          page,
          testInfo,
          `direct-analytic-${steps}-samples`,
        ),
      });
    }
    console.log("raymarch-cached-potential-sample-equivalence", captures);

    const reference = captures[0];
    const production = captures[1];
    expect(
      Math.abs(
        production.metrics.negativeSpaceRatio -
          reference.metrics.negativeSpaceRatio,
      ),
    ).toBeLessThanOrEqual(0.03);
    expect(
      Math.abs(
        production.metrics.fieldInteriorLuminanceStdDev -
          reference.metrics.fieldInteriorLuminanceStdDev,
      ),
    ).toBeLessThanOrEqual(0.035);
    expect(
      Math.abs(
        production.metrics.fieldInteriorGradientMean -
          reference.metrics.fieldInteriorGradientMean,
      ),
    ).toBeLessThanOrEqual(0.025);
    expect(
      Math.abs(
        production.metrics.fieldInteriorGradientP90 -
          reference.metrics.fieldInteriorGradientP90,
      ),
    ).toBeLessThanOrEqual(0.04);
    expect(
      Math.abs(
        production.metrics.fieldInteriorLaplacianMean -
          reference.metrics.fieldInteriorLaplacianMean,
      ),
    ).toBeLessThanOrEqual(0.04);
    expect(production.metrics.broadWashRatio).toBeLessThan(0.24);
    expect(production.metrics.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(production.metrics.nonblankRatio, 1e-6),
    );

    await teardownFixtureAndAwaitLiveField(page);
  });

  test("fixed aperture keeps low, mid, and high tones legible", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    const toneFrequenciesHz = [68, 528, 1056];
    const observations = [];
    for (const toneHz of toneFrequenciesHz) {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto("/");
      await waitForControlSurface(page);
      await applyOpticalMeasurementControls(page);
      await setControl(page, "auditEnabled", true);
      await setControl(page, "rotationMode", "off");
      await setControl(page, "motionAmount", 0);
      await setControl(page, "testToneAmplitude", 0.5);
      await setControl(page, "testToneHz", toneHz);
      await setControl(page, "injectTestTone", true);
      await expect
        .poll(
          () =>
            page.evaluate(() => ({
              backend: window.__baryonRendererInfo?.backend ?? null,
              fieldState:
                window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
              toneHz: window.__baryonControls?.getState?.().testToneHz ?? null,
              volumeVisible:
                window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ??
                false,
            })),
          { timeout: 10_000 },
        )
        .toEqual({
          backend: "WebGPUBackend",
          fieldState: "test",
          toneHz,
          volumeVisible: true,
        });
      await page.waitForTimeout(600);
      await awaitCanvasPresentation(page);
      const metrics = await captureCanvasMetricArtifact(
        page,
        testInfo,
        `photographic-aperture-${String(toneHz).replace(".", "-")}hz`,
      );
      observations.push({ toneHz, metrics });
    }

    console.log("raymarch-fixed-aperture-band-sweep", observations);
    for (const { metrics } of observations) {
      expect(metrics.p98).toBeGreaterThanOrEqual(0.08);
      expect(metrics.nonblankRatio).toBeGreaterThanOrEqual(0.04);
      expect(metrics.negativeSpaceRatio).toBeGreaterThanOrEqual(0.6);
      expect(metrics.brightLaneRatio).toBeGreaterThanOrEqual(0.01);
      expect(metrics.brightLaneRatio).toBeLessThanOrEqual(0.14);
      expect(metrics.broadWashRatio).toBeLessThan(0.24);
      expect(metrics.fieldInteriorDarkRatio).toBeGreaterThanOrEqual(0.04);
      expect(
        metrics.continuityLargestComponentAreaRatio,
      ).toBeGreaterThanOrEqual(0.85);
      expect(metrics.nearWhitePixelRatio).toBeLessThan(
        0.08 * Math.max(metrics.nonblankRatio, 1e-6),
      );
    }
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

  test("laser focus materially reshapes the production carrier", async ({
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
    await setControl(page, "holographicFresnelPower", 0.5);
    await setControl(page, "bloomEnabled", false);
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

    await awaitCanvasPresentation(page);
    const broadFocus = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "laser-focus-broad-static-528",
    );

    await setControl(page, "holographicFresnelPower", 8);
    await awaitCanvasPresentation(page);
    const narrowFocus = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "laser-focus-narrow-static-528",
    );

    console.log("laser-focus-production-delta", {
      broadFocus,
      narrowFocus,
    });
    expect(broadFocus.brightLaneRatio).toBeGreaterThan(
      narrowFocus.brightLaneRatio * 1.15,
    );
    expect(broadFocus.fieldInteriorLuminanceP90).toBeGreaterThan(
      narrowFocus.fieldInteriorLuminanceP90 * 1.15,
    );
    expect(narrowFocus.activeGradientP95).toBeGreaterThanOrEqual(0.08);
    expect(broadFocus.broadWashRatio).toBeLessThan(0.24);
    expect(narrowFocus.broadWashRatio).toBeLessThan(0.24);
    expect(broadFocus.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(broadFocus.nonblankRatio, 1e-6),
    );
    expect(narrowFocus.nearWhitePixelRatio).toBeLessThan(
      0.08 * Math.max(narrowFocus.nonblankRatio, 1e-6),
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

  test("dense polyphonic fixture keeps pure spectral output chromatic", async ({
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
      name: "dense-polyphonic-repeated.wav",
      mimeType: "audio/wav",
      buffer: createDensePolyphonicFixtureWavBuffer({ repeatCount: 6 }),
    });
    const playButton = page.getByRole("button", { name: "Play", exact: true });
    await expect(playButton).toBeEnabled();
    await playButton.click();
    await seekPlaybackTimeline(page, 4.5 / 72);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          sourceKind: window.__baryonAuditSnapshot?.sourceSession?.kind ?? null,
          sourcePhase:
            window.__baryonAuditSnapshot?.sourceSession?.phase ?? null,
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
        sourceKind: "file",
        sourcePhase: "active",
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
              spectralColorFieldImplementationState:
                debug.spectralColorFieldImplementationState ?? null,
              opticalFieldRepresentation:
                debug.opticalFieldRepresentation ?? null,
              radiationPotentialPacketReady:
                (debug.radiationPotentialNormalizedEnergyNorm ?? 0) >= 0.999,
            };
          }),
        { timeout: 15_000 },
      )
      .toMatchObject({
        colorMode: "spectral",
        spectralColorFieldImplementationState:
          RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
        opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
        radiationPotentialPacketReady: true,
      });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.radiationPotentialObservedCoefficientEnergy ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonAuditSnapshot?.raymarchDebug
              ?.radiationPotentialExposureDrive ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await awaitCanvasPresentation(page);
    const topologyArtifactPath = testInfo.outputPath(
      "photographic-dense-polyphonic.png",
    );
    // Topology belongs to the first complete field, before the live audio phase
    // advances through the cadence and continuity observations below.
    const readyTopologyFrame = await readCanvasLuminanceMetrics(
      page,
      topologyArtifactPath,
    );
    console.log(
      "raymarch-dense-chromatic-readiness",
      await page.evaluate(() => {
        const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
        return {
          exposureDrive: debug.radiationPotentialExposureDrive ?? 0,
          observedCoefficientEnergy:
            debug.radiationPotentialObservedCoefficientEnergy ?? 0,
          normalizedEnergyNorm:
            debug.radiationPotentialNormalizedEnergyNorm ?? 0,
          bakeModeCount: debug.radiationPotentialBakeModeCount ?? 0,
          plasmaProbePreBloomRadiance: debug.plasmaProbePreBloomRadiance ?? 0,
        };
      }),
      readyTopologyFrame,
    );
    await expect
      .poll(
        async () => {
          const metrics = await readCanvasLuminanceMetrics(page);
          return (
            metrics.chromaticPixelRatio > 0.001 &&
            metrics.activeMeanSaturation > 0.2
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    const denseDiagnostics = await page.evaluate(() => {
      const debug = window.__baryonAuditSnapshot?.raymarchDebug ?? {};
      return {
        modeCapacity: debug.radiationPotentialModeCapacity ?? 0,
        potentialBakeEvaluationCountPerVoxel:
          debug.radiationPotentialBakeModeCount ?? 0,
        normalizedEnergyNorm: debug.radiationPotentialNormalizedEnergyNorm ?? 0,
        observedCoefficientEnergy:
          debug.radiationPotentialObservedCoefficientEnergy ?? 0,
        exposureDrive: debug.radiationPotentialExposureDrive ?? 0,
        avgOpacity: debug.avgOpacity ?? 0,
        avgDensity: debug.avgDensity ?? 0,
        plasmaProbePreBloomRadiance: debug.plasmaProbePreBloomRadiance ?? 0,
        plasmaProbeBaseRadiance: debug.plasmaProbeBaseRadiance ?? null,
      };
    });
    // Start the two-second promotion window only after the seeded observer has
    // resolved a genuinely multihued field. The topology artifact above keeps
    // seed-time evidence; this gate prevents initialization latency from being
    // misclassified as steady-state hue-family loss.
    await expect
      .poll(
        async () => {
          const metrics = await readCanvasSpectralWindowMetrics(page);
          return {
            visibleHueFamiliesReady: metrics.visibleHueFamilyCount >= 3,
            spatialHueEntropyReady: metrics.spatialHueEntropyBits >= 1.2,
          };
        },
        { timeout: 10_000 },
      )
      .toEqual({
        visibleHueFamiliesReady: true,
        spatialHueEntropyReady: true,
      });
    await page.waitForTimeout(500);
    const frames = [];
    let windowStartSeconds = null;
    while (frames.length < 30) {
      const metrics = await readCanvasSpectralWindowMetrics(page);
      if (metrics.activePixelRatio <= 0.01) continue;
      windowStartSeconds ??= metrics.playbackTimeSeconds;
      frames.push(metrics);
      if (metrics.playbackTimeSeconds - windowStartSeconds >= 2) break;
      await page.waitForTimeout(16);
    }
    await testInfo.attach("dense-polyphonic-two-second-metrics", {
      body: Buffer.from(JSON.stringify(frames, null, 2)),
      contentType: "application/json",
    });
    await setControl(page, "bloomEnabled", true);
    await awaitCanvasPresentation(page);
    const bloomOn = await captureCanvasMetricArtifact(
      page,
      testInfo,
      "photographic-dense-polyphonic-bloom-on",
    );
    await setControl(page, "bloomEnabled", false);
    await testInfo.attach("photographic-dense-polyphonic", {
      path: topologyArtifactPath,
      contentType: "image/png",
    });

    const firstFrame = readyTopologyFrame;
    const playbackTimes = frames.map((frame) => frame.playbackTimeSeconds);
    console.log(
      "raymarch-dense-polyphonic-diagnostic",
      denseDiagnostics,
      readyTopologyFrame,
      firstFrame,
      {
        windowFrameCount: frames.length,
        playbackSpanSeconds: playbackTimes.at(-1) - playbackTimes[0],
        minimumSaturation: Math.min(
          ...frames.map((frame) => frame.activeMeanSaturation),
        ),
        minimumFixedLightnessChroma: Math.min(
          ...frames.map((frame) => frame.activeMeanFixedLightnessChroma),
        ),
        maximumBrightLowSaturation: Math.max(
          ...frames.map((frame) => frame.brightLowSaturationPixelRatio),
        ),
        minimumChromaticPixelRatio: Math.min(
          ...frames.map((frame) => frame.chromaticPixelRatio),
        ),
        visibleHueFamilyFrameRatio:
          frames.filter((frame) => frame.visibleHueFamilyCount >= 3).length /
          Math.max(1, frames.length),
        entropyFrameRatio:
          frames.filter((frame) => frame.spatialHueEntropyBits >= 1.2).length /
          Math.max(1, frames.length),
      },
    );
    expect(firstFrame.nonblankRatio).toBeGreaterThan(0.01);
    expect(firstFrame.negativeSpaceRatio).toBeGreaterThanOrEqual(0.72);
    expect(firstFrame.contrastRatio).toBeGreaterThanOrEqual(3.0);
    expect(firstFrame.broadWashRatio).toBeLessThan(0.17);
    expect(firstFrame.brightActiveRatio).toBeGreaterThan(0.05);
    expect(firstFrame.nearWhitePixelRatio).toBeLessThan(0.04);
    expect(firstFrame.brightLowSaturationPixelRatio).toBeLessThan(0.08);
    expect(firstFrame.centralConnectedNonblackRatio).toBeGreaterThan(0.01);
    expect(firstFrame.chromaticPixelRatio).toBeGreaterThan(0.08);
    expect(firstFrame.activeMeanChroma).toBeGreaterThan(0.08);
    expect(firstFrame.fieldInteriorLuminanceStdDev).toBeGreaterThanOrEqual(
      0.025,
    );
    expect(firstFrame.fieldInteriorGradientMean).toBeGreaterThanOrEqual(0.013);
    expect(firstFrame.fieldInteriorLaplacianMean).toBeGreaterThanOrEqual(0.03);
    // A vivid chromatic plasma can legitimately illuminate most of its active
    // interior. Washout is loss of chroma and spatial variation, not brightness
    // by itself, so retain explicit contrast and gradient evidence here.
    expect(firstFrame.fieldInteriorPeakToValleyRatio).toBeGreaterThanOrEqual(
      1.5,
    );
    expect(firstFrame.fieldInteriorRelativeVariation).toBeGreaterThanOrEqual(
      0.1,
    );
    expect(firstFrame.fieldInteriorRelativeGradient).toBeGreaterThanOrEqual(
      0.08,
    );
    // The brightest decile deliberately separates into local excitation peaks,
    // so it is not a continuity authority. At equal carrier coverage, one
    // component must own at least 90% of the visible structure.
    expect(
      readyTopologyFrame.continuityLargestComponentAreaRatio,
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      denseDiagnostics.potentialBakeEvaluationCountPerVoxel,
    ).toBeGreaterThan(0);
    expect(
      denseDiagnostics.potentialBakeEvaluationCountPerVoxel,
    ).toBeLessThanOrEqual(denseDiagnostics.modeCapacity);
    expect(denseDiagnostics.normalizedEnergyNorm).toBeGreaterThanOrEqual(0.995);
    expect(denseDiagnostics.exposureDrive).toBeGreaterThan(0);
    expect(playbackTimes.every(Number.isFinite)).toBe(true);
    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(playbackTimes.at(-1) - playbackTimes[0]).toBeGreaterThanOrEqual(
      1.75,
    );
    expect(playbackTimes.at(-1) - playbackTimes[0]).toBeLessThanOrEqual(2.5);
    expect(
      Math.min(...frames.map((frame) => frame.activeMeanSaturation)),
    ).toBeGreaterThanOrEqual(0.55);
    expect(
      Math.min(...frames.map((frame) => frame.activeMeanFixedLightnessChroma)),
    ).toBeGreaterThanOrEqual(0.08);
    expect(
      Math.max(...frames.map((frame) => frame.brightLowSaturationPixelRatio)),
    ).toBeLessThanOrEqual(0.02);
    expect(
      Math.min(...frames.map((frame) => frame.chromaticPixelRatio)),
    ).toBeGreaterThanOrEqual(0.12);
    expect(
      frames.filter((frame) => frame.visibleHueFamilyCount >= 3).length /
        frames.length,
    ).toBeGreaterThanOrEqual(0.95);
    expect(
      frames.filter((frame) => frame.spatialHueEntropyBits >= 1.2).length /
        frames.length,
    ).toBeGreaterThanOrEqual(0.95);
    expect(
      Math.max(...frames.map((frame) => frame.nearWhitePixelRatio)),
    ).toBeLessThan(0.1);
    expect(bloomOn.centralConnectedNonblackRatio).toBeGreaterThan(0.01);
    expect(bloomOn.activeMeanSaturation).toBeGreaterThanOrEqual(0.5);
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

  test("spectral mode is independent of both configured static colors", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFrozen528Fixture(page, "spectral-static-color-independence");
    const difference = await page.evaluate(async () => {
      const controls = window.__baryonControls;
      const fixture = window.__baryonAuditFixture;
      const settle = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      controls.setControl("colorMode", "spectral");
      controls.setControl("spectralChroma", 0.55);
      controls.setControl("volumeColor", "#ff0000");
      controls.setControl("surfaceColor", "#00ff00");
      await settle();
      const first = await fixture.exportBuffers();
      controls.setControl("volumeColor", "#0000ff");
      controls.setControl("surfaceColor", "#ffff00");
      await settle();
      const second = await fixture.exportBuffers();
      let total = 0;
      let maximum = 0;
      let samples = 0;
      for (let offset = 0; offset < first.displayRgba.length; offset += 4) {
        const firstLuminance =
          0.2126 * first.displayRgba[offset] +
          0.7152 * first.displayRgba[offset + 1] +
          0.0722 * first.displayRgba[offset + 2];
        const secondLuminance =
          0.2126 * second.displayRgba[offset] +
          0.7152 * second.displayRgba[offset + 1] +
          0.0722 * second.displayRgba[offset + 2];
        if (Math.max(firstLuminance, secondLuminance) <= 1) continue;
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = Math.abs(
            first.displayRgba[offset + channel] -
              second.displayRgba[offset + channel],
          );
          total += delta;
          maximum = Math.max(maximum, delta);
          samples += 1;
        }
      }
      return {
        mean: total / Math.max(1, samples) / 255,
        maximum: maximum / 255,
        samples,
      };
    });

    expect(difference.samples).toBeGreaterThan(0);
    expect(difference.mean).toBeLessThanOrEqual(1 / 255);
    expect(difference.maximum).toBeLessThanOrEqual(2 / 255);
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
            opticalFieldRepresentation:
              window.__baryonAuditSnapshot?.raymarchDebug
                ?.opticalFieldRepresentation ?? null,
            fixtureBridge: typeof window.__baryonAuditFixture,
          })),
        { timeout: 30_000 },
      )
      .toEqual({
        fieldState: "test",
        volumeVisible: true,
        opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
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
    // Widened with the base test's ceiling for the bright cymascope carrier.
    expect(accentOn.brightLaneRatio).toBeLessThanOrEqual(0.16);
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
    const baseRadiancePixels = decodeFloatBase64(
      aovTransfer.baseRadianceBase64,
    );
    // A radiance-dead capture passes every upper-bound headroom cap
    // vacuously; the checkpoint must witness real base radiance first.
    let maxBaseChannel = 0;
    for (let index = 0; index < baseRadiancePixels.length; index += 4) {
      maxBaseChannel = Math.max(
        maxBaseChannel,
        baseRadiancePixels[index],
        baseRadiancePixels[index + 1],
        baseRadiancePixels[index + 2],
      );
    }
    expect(maxBaseChannel).toBeGreaterThan(0);

    const headroom = evaluateIntegratedSceneLinearHeadroom({
      premultipliedRadiance: baseRadiancePixels,
      coverage: decodeFloatBase64(aovTransfer.coverageBase64),
    });
    console.log("raymarch-frozen-headroom", headroom);

    expect(headroom.activeSampleCount).toBeGreaterThan(0);
    expect(headroom.achieved).toBe(true);
    expect(headroom.passesLuminance).toBe(true);
    expect(headroom.passesMaxChannel).toBe(true);
    expect(headroom.passesOverloadShare).toBe(true);

    await teardownFixtureAndAwaitLiveField(page);
  });
});
