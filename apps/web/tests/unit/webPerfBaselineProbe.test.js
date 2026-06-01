import assert from "node:assert/strict";
import test from "node:test";
import {
  COST_PROFILE_SCENARIOS,
  DEFAULT_BASELINE_CASES,
  DEFAULT_PROFILE_SCENARIOS,
  resolvePerfProbeConfig,
  summarizeFrameIntervals,
} from "../../scripts/webPerfBaselineProbe.mjs";

test("resolvePerfProbeConfig defaults to fixed Max Quality baseline cases", () => {
  const config = resolvePerfProbeConfig({
    env: {},
    argv: [],
    now: new Date("2026-05-31T14:30:00.000Z"),
  });

  assert.equal(config.url, "http://127.0.0.1:5173/");
  assert.equal(config.headless, false);
  assert.equal(config.audioSource, "test-tone");
  assert.equal(config.sampleMs, 5000);
  assert.equal(config.warmupMs, 3000);
  assert.deepEqual(
    config.cases.map((entry) => entry.name),
    DEFAULT_BASELINE_CASES.map((entry) => entry.name),
  );
  assert.deepEqual(
    config.scenarios.map((entry) => entry.name),
    DEFAULT_PROFILE_SCENARIOS.map((entry) => entry.name),
  );
  assert.deepEqual(Object.fromEntries(config.controlMutations), {
    performanceHudEnabled: true,
    auditEnabled: true,
    renderQualityPreset: "max-quality",
    raymarchSteps: 80,
    injectTestTone: true,
    testToneHz: 528,
    testToneAmplitude: 0.5,
  });
  assert.match(
    config.outputDir,
    /test-results\/perf\/web-baseline\/2026-05-31t14-30-00-000z$/,
  );
});

test("resolvePerfProbeConfig selects dense file audio source", () => {
  const config = resolvePerfProbeConfig({
    env: {
      BARYON_WEB_PERF_AUDIO_SOURCE: "test-tone",
    },
    argv: ["--audio-source", "dense-file"],
    now: new Date("2026-05-31T14:30:00.000Z"),
  });

  assert.equal(config.audioSource, "dense-file");
});

test("resolvePerfProbeConfig selects and filters cost profile scenarios", () => {
  const config = resolvePerfProbeConfig({
    env: {
      BARYON_WEB_PERF_PROFILE: "cost",
      BARYON_WEB_PERF_SCENARIO: "no-bloom,no-traa",
    },
    argv: [],
    now: new Date("2026-05-31T14:30:00.000Z"),
  });

  assert.deepEqual(
    COST_PROFILE_SCENARIOS.map((entry) => entry.name),
    ["full-clean", "full-hud-audit", "no-bloom", "no-traa", "no-bloom-no-traa"],
  );
  assert.deepEqual(
    config.scenarios.map((entry) => entry.name),
    ["no-bloom", "no-traa"],
  );
  assert.deepEqual(config.scenarios[0].controlMutations, [
    ["performanceHudEnabled", false],
    ["auditEnabled", false],
    ["bloomEnabled", false],
  ]);
});

test("resolvePerfProbeConfig lets CLI profile override the environment", () => {
  const config = resolvePerfProbeConfig({
    env: {
      BARYON_WEB_PERF_PROFILE: "default",
    },
    argv: ["--profile", "cost", "--scenario", "full-clean"],
    now: new Date("2026-05-31T14:30:00.000Z"),
  });

  assert.deepEqual(
    config.scenarios.map((entry) => entry.name),
    ["full-clean"],
  );
});

test("resolvePerfProbeConfig filters custom cases by name", () => {
  const config = resolvePerfProbeConfig({
    env: {
      BARYON_WEB_PERF_URL: "http://localhost:5173/",
      BARYON_WEB_PERF_HEADLESS: "1",
      BARYON_WEB_PERF_SAMPLE_MS: "1234",
      BARYON_WEB_PERF_WARMUP_MS: "2345",
      BARYON_WEB_PERF_CASE: "retina",
      BARYON_WEB_PERF_CASES: JSON.stringify([
        {
          name: "retina",
          viewport: { width: 1504, height: 830 },
          deviceScaleFactor: 2,
        },
        {
          name: "stage",
          viewport: { width: 2560, height: 1536 },
          deviceScaleFactor: 1,
        },
      ]),
    },
    argv: [],
    now: new Date("2026-05-31T14:30:00.000Z"),
  });

  assert.equal(config.url, "http://localhost:5173/");
  assert.equal(config.headless, true);
  assert.equal(config.sampleMs, 1234);
  assert.equal(config.warmupMs, 2345);
  assert.deepEqual(config.cases, [
    {
      name: "retina",
      viewport: { width: 1504, height: 830 },
      deviceScaleFactor: 2,
    },
  ]);
});

test("summarizeFrameIntervals reports FPS and long-frame buckets", () => {
  const summary = summarizeFrameIntervals([16, 17, 20, 25.5, 33.5, 51], 163);

  assert.equal(summary.frameCount, 6);
  assert.equal(summary.averageFrameMs, 27.166666666666668);
  assert.ok(Math.abs(summary.averageFps - 36.80981595092024) < 1e-12);
  assert.ok(Math.abs(summary.countedFps - 36.80981595092025) < 1e-12);
  assert.equal(summary.framesOver16_7Ms, 5);
  assert.equal(summary.framesOver25Ms, 3);
  assert.equal(summary.framesOver33_3Ms, 2);
  assert.equal(summary.framesOver50Ms, 1);
});
