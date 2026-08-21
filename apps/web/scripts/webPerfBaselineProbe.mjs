import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_OUTPUT_ROOT = path.join(
  APP_ROOT,
  "test-results",
  "perf",
  "web-baseline",
);
const DENSE_POLYPHONIC_FIXTURE = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/engine/src/utils/audio/fixtures/dense-polyphonic-12s.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const AUDIO_SOURCE_MODES = Object.freeze({
  testTone: "test-tone",
  denseFile: "dense-file",
  none: "none",
});

export const DEFAULT_BASELINE_CASES = Object.freeze([
  Object.freeze({
    name: "stage-2560x1536-dpr1",
    viewport: Object.freeze({ width: 2560, height: 1536 }),
    deviceScaleFactor: 1,
  }),
  Object.freeze({
    name: "listener-1504x830-dpr2",
    viewport: Object.freeze({ width: 1504, height: 830 }),
    deviceScaleFactor: 2,
  }),
  Object.freeze({
    name: "desktop-1920x1080-dpr1",
    viewport: Object.freeze({ width: 1920, height: 1080 }),
    deviceScaleFactor: 1,
  }),
]);

const DEFAULT_CONTROL_MUTATIONS = Object.freeze([
  Object.freeze(["performanceHudEnabled", true]),
  Object.freeze(["auditEnabled", true]),
  Object.freeze(["renderQualityPreset", "max-quality"]),
  Object.freeze(["raymarchSteps", 80]),
  Object.freeze(["injectTestTone", true]),
  Object.freeze(["testToneHz", 528]),
  Object.freeze(["testToneAmplitude", 0.5]),
]);

export const DEFAULT_PROFILE_SCENARIOS = Object.freeze([
  Object.freeze({
    name: "full-hud-audit",
    controlMutations: Object.freeze([]),
  }),
]);

export const COST_PROFILE_SCENARIOS = Object.freeze([
  Object.freeze({
    name: "full-clean",
    controlMutations: Object.freeze([
      Object.freeze(["performanceHudEnabled", false]),
      Object.freeze(["auditEnabled", false]),
    ]),
  }),
  Object.freeze({
    name: "full-hud-audit",
    controlMutations: Object.freeze([]),
  }),
  Object.freeze({
    name: "no-bloom",
    controlMutations: Object.freeze([
      Object.freeze(["performanceHudEnabled", false]),
      Object.freeze(["auditEnabled", false]),
      Object.freeze(["bloomEnabled", false]),
    ]),
  }),
  Object.freeze({
    name: "no-traa",
    controlMutations: Object.freeze([
      Object.freeze(["performanceHudEnabled", false]),
      Object.freeze(["auditEnabled", false]),
      Object.freeze(["traaEnabled", false]),
    ]),
  }),
  Object.freeze({
    name: "no-bloom-no-traa",
    controlMutations: Object.freeze([
      Object.freeze(["performanceHudEnabled", false]),
      Object.freeze(["auditEnabled", false]),
      Object.freeze(["bloomEnabled", false]),
      Object.freeze(["traaEnabled", false]),
    ]),
  }),
]);

function createTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-").toLowerCase();
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      if (arg.includes("=")) {
        return arg.slice(arg.indexOf("=") + 1);
      }
      index += 1;
      return argv[index];
    };

    if (arg === "--headed") {
      args.headless = false;
    } else if (arg === "--headless") {
      args.headless = true;
    } else if (arg === "--url" || arg.startsWith("--url=")) {
      args.url = readValue();
    } else if (arg === "--sample-ms" || arg.startsWith("--sample-ms=")) {
      args.sampleMs = readValue();
    } else if (arg === "--warmup-ms" || arg.startsWith("--warmup-ms=")) {
      args.warmupMs = readValue();
    } else if (arg === "--case" || arg.startsWith("--case=")) {
      args.caseFilter = readValue();
    } else if (arg === "--profile" || arg.startsWith("--profile=")) {
      args.profile = readValue();
    } else if (arg === "--scenario" || arg.startsWith("--scenario=")) {
      args.scenarioFilter = readValue();
    } else if (arg === "--audio-source" || arg.startsWith("--audio-source=")) {
      args.audioSource = readValue();
    } else if (arg === "--output-dir" || arg.startsWith("--output-dir=")) {
      args.outputDir = readValue();
    }
  }
  return args;
}

function normalizeCaseFilter(value) {
  if (!value) {
    return null;
  }
  return new Set(
    String(value)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function normalizeControlMutations(mutations) {
  if (!Array.isArray(mutations)) {
    return [];
  }

  return mutations.map((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") {
      throw new Error(
        "[web-perf-baseline] Invalid control mutation. Expected [key, value].",
      );
    }
    return [entry[0], entry[1]];
  });
}

function normalizeAudioSource(value) {
  const normalized = String(value ?? AUDIO_SOURCE_MODES.testTone)
    .trim()
    .toLowerCase();
  if (Object.values(AUDIO_SOURCE_MODES).includes(normalized)) {
    return normalized;
  }
  throw new Error(
    `[web-perf-baseline] Invalid audio source "${value}". Expected test-tone, dense-file, or none.`,
  );
}

function resolveProfileScenarios(
  env = process.env,
  scenarioFilter = null,
  profile = null,
) {
  const selectedProfile = profile ?? env.BARYON_WEB_PERF_PROFILE;
  const scenarioSource = env.BARYON_WEB_PERF_SCENARIOS
    ? JSON.parse(env.BARYON_WEB_PERF_SCENARIOS)
    : selectedProfile === "cost"
      ? COST_PROFILE_SCENARIOS
      : DEFAULT_PROFILE_SCENARIOS;
  const normalizedScenarios = scenarioSource.map((entry) => {
    if (!entry?.name) {
      throw new Error("[web-perf-baseline] Invalid scenario entry.");
    }
    return {
      name: String(entry.name),
      controlMutations: normalizeControlMutations(entry.controlMutations),
    };
  });

  if (!scenarioFilter) {
    return normalizedScenarios;
  }

  return normalizedScenarios.filter((entry) => scenarioFilter.has(entry.name));
}

function resolveBaselineCases(env = process.env, caseFilter = null) {
  const customCases = env.BARYON_WEB_PERF_CASES
    ? JSON.parse(env.BARYON_WEB_PERF_CASES)
    : DEFAULT_BASELINE_CASES;
  const normalizedCases = customCases.map((entry) => {
    const width = parsePositiveInteger(entry?.viewport?.width, 0);
    const height = parsePositiveInteger(entry?.viewport?.height, 0);
    const deviceScaleFactor = Number(entry?.deviceScaleFactor);
    if (
      !entry?.name ||
      width <= 0 ||
      height <= 0 ||
      !Number.isFinite(deviceScaleFactor) ||
      deviceScaleFactor <= 0
    ) {
      throw new Error(
        "[web-perf-baseline] Invalid case entry. Expected name, viewport width/height, and deviceScaleFactor.",
      );
    }
    return {
      name: String(entry.name),
      viewport: { width, height },
      deviceScaleFactor,
    };
  });

  if (!caseFilter) {
    return normalizedCases;
  }

  return normalizedCases.filter((entry) => caseFilter.has(entry.name));
}

export function resolvePerfProbeConfig({
  env = process.env,
  argv = process.argv.slice(2),
  now = new Date(),
} = {}) {
  const args = parseArgs(argv);
  const caseFilter = normalizeCaseFilter(
    args.caseFilter ?? env.BARYON_WEB_PERF_CASE,
  );
  const scenarioFilter = normalizeCaseFilter(
    args.scenarioFilter ?? env.BARYON_WEB_PERF_SCENARIO,
  );
  const outputDir =
    args.outputDir ??
    env.BARYON_WEB_PERF_OUTPUT_DIR ??
    path.join(DEFAULT_OUTPUT_ROOT, createTimestamp(now));

  return {
    url: args.url ?? env.BARYON_WEB_PERF_URL ?? "http://127.0.0.1:5173/",
    headless:
      typeof args.headless === "boolean"
        ? args.headless
        : parseBoolean(env.BARYON_WEB_PERF_HEADLESS, false),
    browserChannel: env.BARYON_WEB_PERF_BROWSER_CHANNEL || null,
    executablePath: env.BARYON_WEB_PERF_EXECUTABLE_PATH || null,
    audioSource: normalizeAudioSource(
      args.audioSource ?? env.BARYON_WEB_PERF_AUDIO_SOURCE,
    ),
    sampleMs: parsePositiveInteger(
      args.sampleMs ?? env.BARYON_WEB_PERF_SAMPLE_MS,
      5000,
    ),
    warmupMs: parsePositiveInteger(
      args.warmupMs ?? env.BARYON_WEB_PERF_WARMUP_MS,
      3000,
    ),
    outputDir,
    cases: resolveBaselineCases(env, caseFilter),
    scenarios: resolveProfileScenarios(env, scenarioFilter, args.profile),
    controlMutations: DEFAULT_CONTROL_MUTATIONS.map(([key, value]) => [
      key,
      value,
    ]),
  };
}

function summarizeNumberSeries(values) {
  if (!values.length) {
    return {
      average: 0,
      median: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);
  const quantile = (ratio) => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * ratio) - 1),
    );
    return sorted[index];
  };

  return {
    average: sum / values.length,
    median: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export function summarizeFrameIntervals(intervals, durationMs) {
  const frameMs = summarizeNumberSeries(intervals);
  const frameCount = intervals.length;
  const measuredDurationSeconds =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;
  const averageFps = frameMs.average > 0 ? 1000 / frameMs.average : 0;
  const countedFps =
    measuredDurationSeconds > 0 ? frameCount / measuredDurationSeconds : 0;

  return {
    frameCount,
    durationMs,
    averageFrameMs: frameMs.average,
    medianFrameMs: frameMs.median,
    p95FrameMs: frameMs.p95,
    p99FrameMs: frameMs.p99,
    minFrameMs: frameMs.min,
    maxFrameMs: frameMs.max,
    averageFps,
    countedFps,
    framesOver16_7Ms: intervals.filter((value) => value > 16.7).length,
    framesOver25Ms: intervals.filter((value) => value > 25).length,
    framesOver33_3Ms: intervals.filter((value) => value > 33.3).length,
    framesOver50Ms: intervals.filter((value) => value > 50).length,
  };
}

function createDensePolyphonicFixtureWavBuffer({
  sampleRate = 44100,
  amplitude = 0.82,
  durationSeconds = 30,
} = {}) {
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

async function waitForBaryonControls(page) {
  await page.waitForFunction(
    () =>
      typeof window.__baryonControls?.setControl === "function" ||
      Boolean(window.__baryonPerfProbeControls),
    null,
    { timeout: 10000 },
  );
}

async function waitForBaryonRuntime(page) {
  await page.waitForFunction(
    () =>
      window.__baryonTestReady === true ||
      Boolean(
        document.querySelector("canvas") && window.__baryonPerfMetrics?.render,
      ),
    null,
    { timeout: 30000 },
  );
}

async function applyProbeControls(page, controlMutations) {
  await page.evaluate(async (mutations) => {
    for (const [key, value] of mutations) {
      if (typeof window.__baryonControls?.setControl === "function") {
        window.__baryonControls.setControl(key, value);
      } else {
        window.dispatchEvent(
          new CustomEvent("__baryon-controls-command", {
            detail: { key, value, persistMode: "none" },
          }),
        );
      }
    }
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, controlMutations);

  const expectedControls = Object.fromEntries(controlMutations);
  await page.waitForFunction(
    (expected) => {
      const controls =
        window.__baryonControls?.getState?.() ??
        window.__baryonPerfProbeControls ??
        {};
      return Object.entries(expected).every(([key, value]) =>
        Object.is(controls[key], value),
      );
    },
    expectedControls,
    { timeout: 10000 },
  );
}

async function prepareProbeAudioSource(page, audioSource) {
  if (audioSource !== AUDIO_SOURCE_MODES.denseFile) {
    return;
  }

  await page.locator('input[type="file"]').setInputFiles({
    name: "dense-polyphonic-loop-30s.wav",
    mimeType: "audio/wav",
    buffer: createDensePolyphonicFixtureWavBuffer(),
  });
  const playButton = page.getByRole("button", { name: "Play", exact: true });
  await playButton.click();
  await page.waitForFunction(
    () => {
      const snapshot = window.__baryonAuditSnapshot;
      const modalFreshness = window.__baryonPerfMetrics?.modalFreshness;
      const perfMetricsReady =
        modalFreshness?.sourceMode === "file" &&
        modalFreshness?.fieldState !== "idle" &&
        modalFreshness?.sourceEvidence?.transport?.playing === true;
      if (perfMetricsReady) {
        return true;
      }

      return (
        snapshot?.sourceSession?.kind === "file" &&
        snapshot?.analysisSourceUsed === "file" &&
        snapshot?.raymarchDebug?.fieldState !== "idle"
      );
    },
    null,
    { timeout: 15000 },
  );
}

async function waitForMaxQualityRuntime(page) {
  await page.waitForFunction(
    () => {
      const metrics = window.__baryonPerfMetrics;
      return (
        metrics?.render?.qualityPreset === "max-quality" &&
        metrics?.render?.requestedRaymarchSteps === 80 &&
        metrics?.render?.effectiveRaymarchSteps === 80 &&
        metrics?.renderSurface?.backingWidth > 0 &&
        metrics?.renderSurface?.backingHeight > 0
      );
    },
    null,
    { timeout: 30000 },
  );
}

async function waitForActiveCanvasPresentation(page) {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 10000 });
  const deadline = Date.now() + 20000;
  let lastMetrics = null;
  while (Date.now() < deadline) {
    const screenshot = await canvas.screenshot();
    const {
      data,
      info: { width, height },
    } = await sharp(screenshot)
      .resize({ width: 128, withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let activePixelCount = 0;
    let peakLuminance = 0;
    for (let offset = 0; offset < data.length; offset += 3) {
      const luminance =
        (0.2126 * data[offset] +
          0.7152 * data[offset + 1] +
          0.0722 * data[offset + 2]) /
        255;
      peakLuminance = Math.max(peakLuminance, luminance);
      if (luminance > 0.004) activePixelCount += 1;
    }
    const pixelCount = Math.max(1, width * height);
    lastMetrics = {
      activePixelRatio: activePixelCount / pixelCount,
      peakLuminance,
    };
    if (
      lastMetrics.activePixelRatio > 0.01 &&
      lastMetrics.peakLuminance > 0.02
    ) {
      return lastMetrics;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `[web-perf-baseline] Canvas did not present an active field: ${JSON.stringify(lastMetrics)}`,
  );
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function attachPageDiagnostics(page) {
  const events = [];
  const push = (event) => {
    events.push({
      at: new Date().toISOString(),
      ...event,
    });
  };

  page.on("console", (message) => {
    push({
      type: "console",
      level: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });
  page.on("pageerror", (error) => {
    push({
      type: "pageerror",
      error: serializeError(error),
    });
  });
  page.on("requestfailed", (request) => {
    push({
      type: "requestfailed",
      url: request.url(),
      failure: request.failure(),
    });
  });

  return events;
}

async function collectPageDiagnosticSnapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      baryonTestReady: window.__baryonTestReady ?? null,
      hasControls: typeof window.__baryonControls?.setControl === "function",
      hasPerfMetrics: Boolean(window.__baryonPerfMetrics),
      hasAuditSnapshot: Boolean(window.__baryonAuditSnapshot),
      controls:
        window.__baryonControls?.getState?.() ??
        window.__baryonPerfProbeControls ??
        null,
      bodyText: document.body?.innerText?.slice(0, 2000) ?? "",
      canvas: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
          }
        : null,
      perfMetrics: window.__baryonPerfMetrics ?? null,
    };
  });
}

async function sampleAnimationFrames(page, sampleMs) {
  return page.evaluate(
    ({ sampleMs: durationMs }) =>
      new Promise((resolve) => {
        const intervals = [];
        let startedAt = null;
        let previousTimestamp = null;

        function step(timestamp) {
          if (startedAt == null) {
            startedAt = timestamp;
            previousTimestamp = timestamp;
          } else {
            intervals.push(timestamp - previousTimestamp);
            previousTimestamp = timestamp;
          }

          if (timestamp - startedAt >= durationMs) {
            const canvas = document.querySelector("canvas");
            const rect = canvas?.getBoundingClientRect?.();
            resolve({
              durationMs: timestamp - startedAt,
              intervals,
              perfMetrics: window.__baryonPerfMetrics ?? null,
              auditSnapshot: window.__baryonAuditSnapshot ?? null,
              viewport: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
              },
              canvas: canvas
                ? {
                    width: canvas.width,
                    height: canvas.height,
                    clientWidth: canvas.clientWidth,
                    clientHeight: canvas.clientHeight,
                    rectWidth: rect?.width ?? null,
                    rectHeight: rect?.height ?? null,
                  }
                : null,
            });
            return;
          }

          window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);
      }),
    { sampleMs },
  );
}

function composeScenarioControlMutations(config, scenario) {
  const merged = new Map(config.controlMutations);
  for (const [key, value] of scenario.controlMutations) {
    merged.set(key, value);
  }
  merged.set("renderQualityPreset", "max-quality");
  merged.set("raymarchSteps", 80);
  merged.set(
    "injectTestTone",
    config.audioSource === AUDIO_SOURCE_MODES.testTone,
  );
  return [...merged.entries()];
}

async function runBaselineCase(browser, config, scenario, baselineCase) {
  const context = await browser.newContext({
    viewport: baselineCase.viewport,
    deviceScaleFactor: baselineCase.deviceScaleFactor,
  });
  await context.addInitScript(() => {
    window.localStorage?.clear?.();
    // Production omits the devtools bridge by design. Observe and command the
    // always-live controls event boundary so this probe measures the shipping
    // bundle rather than a development-only build.
    window.__baryonPerfProbeControls = null;
    window.addEventListener("__baryon-controls-change", (event) => {
      window.__baryonPerfProbeControls = { ...(event.detail ?? {}) };
    });
  });

  const page = await context.newPage();
  const pageDiagnostics = attachPageDiagnostics(page);
  try {
    const controlMutations = composeScenarioControlMutations(config, scenario);
    await page.goto(config.url, { waitUntil: "domcontentloaded" });
    await waitForBaryonControls(page);
    await applyProbeControls(page, controlMutations);
    await waitForBaryonRuntime(page);
    await prepareProbeAudioSource(page, config.audioSource);
    await waitForMaxQualityRuntime(page);
    await page.waitForTimeout(config.warmupMs);
    const presentation = await waitForActiveCanvasPresentation(page);

    const sample = await sampleAnimationFrames(page, config.sampleMs);
    const frameSummary = summarizeFrameIntervals(
      sample.intervals,
      sample.durationMs,
    );

    return {
      ok: true,
      scenario: scenario.name,
      name: baselineCase.name,
      audioSource: config.audioSource,
      viewport: baselineCase.viewport,
      deviceScaleFactor: baselineCase.deviceScaleFactor,
      controls: Object.fromEntries(controlMutations),
      requestedPixelCount:
        baselineCase.viewport.width *
        baselineCase.viewport.height *
        baselineCase.deviceScaleFactor *
        baselineCase.deviceScaleFactor,
      frameSummary,
      presentation,
      renderSurface: sample.perfMetrics?.renderSurface ?? null,
      render: sample.perfMetrics?.render ?? null,
      modalVarietyAudit: sample.perfMetrics?.render?.modalVarietyAudit ?? null,
      postProcess: sample.perfMetrics?.postProcess ?? null,
      perfBreakdown: sample.perfMetrics?.perfBreakdown ?? null,
      frameDrops: sample.perfMetrics?.frameDrops ?? null,
      modalFreshness: sample.perfMetrics?.modalFreshness
        ? {
            fieldState: sample.perfMetrics.modalFreshness.fieldState,
            sourceMode: sample.perfMetrics.modalFreshness.sourceMode,
            activeModeCount: sample.perfMetrics.modalFreshness.activeModeCount,
            activeModalFieldModeCount:
              sample.perfMetrics.modalFreshness.activeModalFieldModeCount,
            resonantObservedModeCount:
              sample.perfMetrics.modalFreshness.resonantObservedModeCount,
            responseEnvelope:
              sample.perfMetrics.modalFreshness.responseEnvelope,
            motionSignal: sample.perfMetrics.modalFreshness.motionSignal,
            sourceEvidence:
              sample.perfMetrics.modalFreshness.sourceEvidence ?? null,
          }
        : null,
      canvas: sample.canvas,
      browserViewport: sample.viewport,
      pageDiagnostics,
    };
  } catch (error) {
    return {
      ok: false,
      scenario: scenario.name,
      name: baselineCase.name,
      audioSource: config.audioSource,
      viewport: baselineCase.viewport,
      deviceScaleFactor: baselineCase.deviceScaleFactor,
      requestedPixelCount:
        baselineCase.viewport.width *
        baselineCase.viewport.height *
        baselineCase.deviceScaleFactor *
        baselineCase.deviceScaleFactor,
      error: serializeError(error),
      diagnosticSnapshot: await collectPageDiagnosticSnapshot(page).catch(
        (snapshotError) => ({
          error: serializeError(snapshotError),
        }),
      ),
      pageDiagnostics,
    };
  } finally {
    await context.close();
  }
}

async function writeCaseArtifact(outputDir, result) {
  const artifactPath = path.join(
    outputDir,
    `${result.scenario}__${result.name}.json`,
  );
  await writeFile(`${artifactPath}`, `${JSON.stringify(result, null, 2)}\n`);
  return artifactPath;
}

function formatCaseLine(result) {
  const label = `${result.scenario}/${result.name}`;
  if (result.ok === false) {
    return `${label}: failed - ${result.error?.message ?? "unknown error"}`;
  }

  const fps = result.frameSummary.averageFps.toFixed(1);
  const frameMs = result.frameSummary.averageFrameMs.toFixed(2);
  const surface = result.renderSurface;
  const surfaceLabel = surface
    ? `${surface.backingWidth}x${surface.backingHeight} ${surface.backingMegapixels.toFixed(2)}MP`
    : "unknown surface";
  return `${label}: ${fps} fps, ${frameMs} ms avg, ${surfaceLabel}`;
}

async function runWebPerfBaselineProbe(config = resolvePerfProbeConfig()) {
  if (config.cases.length === 0) {
    throw new Error("[web-perf-baseline] No baseline cases selected.");
  }
  if (config.scenarios.length === 0) {
    throw new Error("[web-perf-baseline] No profile scenarios selected.");
  }

  await mkdir(config.outputDir, { recursive: true });
  const launchOptions = {
    headless: config.headless,
    // Match the production visual-acceptance browser lane. Chromium otherwise
    // reports adapter-null in headless macOS even when native Metal is
    // available to the host process.
    args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
  };
  if (config.browserChannel) {
    launchOptions.channel = config.browserChannel;
  }
  if (config.executablePath) {
    launchOptions.executablePath = config.executablePath;
  }

  const browser = await chromium.launch(launchOptions);
  const cases = [];
  try {
    for (const scenario of config.scenarios) {
      for (const baselineCase of config.cases) {
        const result = await runBaselineCase(
          browser,
          config,
          scenario,
          baselineCase,
        );
        result.artifactPath = await writeCaseArtifact(config.outputDir, result);
        cases.push(result);
        console.log(formatCaseLine(result));
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    createdAt: new Date().toISOString(),
    url: config.url,
    headless: config.headless,
    browserChannel: config.browserChannel,
    executablePath: config.executablePath,
    audioSource: config.audioSource,
    sampleMs: config.sampleMs,
    warmupMs: config.warmupMs,
    outputDir: config.outputDir,
    controls: Object.fromEntries(config.controlMutations),
    scenarios: config.scenarios.map((scenario) => ({
      name: scenario.name,
      controlMutations: scenario.controlMutations,
    })),
    cases,
  };
  const summaryPath = path.join(config.outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const failedCases = cases.filter((result) => result.ok === false);
  if (failedCases.length > 0) {
    const error = new Error(
      `[web-perf-baseline] ${failedCases.length} baseline case(s) failed. Summary: ${summaryPath}`,
    );
    error.summaryPath = summaryPath;
    throw error;
  }
  return { summary, summaryPath };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWebPerfBaselineProbe()
    .then(({ summaryPath }) => {
      console.log(`summary: ${summaryPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
