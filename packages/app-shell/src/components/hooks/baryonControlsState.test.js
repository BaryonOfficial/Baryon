import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSIS_MODE_BASE_KEY,
  DUAL_COMPARE_TOGGLE_KEY,
  getVisibleControlLayout,
} from "./baryonControlsState.js";

test("builds the advanced controls presentation layout", () => {
  const { folderGroups, presetsAreaControls } = getVisibleControlLayout({
    devtoolsEnabled: true,
    method: "raymarch",
  });
  assert.deepEqual(
    folderGroups.map((group) => group.title),
    ["Mode", "Shape", "Color", "Logo", "Motion", "Display", "Diagnostics"],
  );
  const groupByTitle = new Map(
    folderGroups.map((group) => [group.title, group]),
  );

  assert.deepEqual(
    presetsAreaControls.map((control) => control.key),
    [
      "performanceHudEnabled",
      "renderQualityPreset",
      "customPerformanceTargetFps",
    ],
  );

  const modeGroup = groupByTitle.get("Mode");
  assert.ok(modeGroup);
  assert.deepEqual(
    modeGroup.controls.map((control) => control.key).slice(0, 4),
    ["boundaryMode", ANALYSIS_MODE_BASE_KEY, "fieldCacheOverride", "colorMode"],
  );
  const analysisModeControl = modeGroup.controls.find(
    (control) => control.key === ANALYSIS_MODE_BASE_KEY,
  );
  assert.ok(analysisModeControl);
  assert.equal(
    analysisModeControl.title,
    "Choose which analysis model drives the visuals. Modal Excitation is the true-to-nature resonant-mode model, and Legacy Peak keeps the older peak-driven behavior.",
  );
  assert.deepEqual(analysisModeControl.binding?.options, {
    "Legacy Peak": "legacy-peak",
    "Modal Excitation": "modal-excitation",
  });
  assert.equal(
    modeGroup.controls.find((control) => control.key === "fieldCacheOverride")
      ?.title,
    "Cached is faster and usually looks the same. Direct recomputes the field live instead of using the 3D cache, so it costs more.",
  );
  assert.ok(
    !modeGroup.controls.some((control) =>
      ["renderQualityPreset", "customPerformanceTargetFps"].includes(
        control.key,
      ),
    ),
  );

  const diagnosticsGroup = groupByTitle.get("Diagnostics");
  assert.ok(diagnosticsGroup);
  assert.deepEqual(
    diagnosticsGroup.controls.map((control) => control.key),
    [
      DUAL_COMPARE_TOGGLE_KEY,
      "freezeModeSlots",
      "injectTestTone",
      "testToneHz",
      "testToneAmplitude",
      "cavityGeometry",
      "auditEnabled",
      "logEveryFrames",
      "lowLoadPlaybackDiagnostics",
      "bloomResponseBias",
      "rimBloomBias",
      "rimCompression",
      "forceWebGLFallbackTest",
    ],
  );
});
