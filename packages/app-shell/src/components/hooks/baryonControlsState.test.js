import { expect, test } from "vitest";
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
  expect(folderGroups.map((group) => group.title)).toStrictEqual([
    "Mode",
    "Shape",
    "Color",
    "Logo",
    "Motion",
    "Display",
    "Diagnostics",
  ]);
  const groupByTitle = new Map(
    folderGroups.map((group) => [group.title, group]),
  );

  expect(presetsAreaControls.map((control) => control.key)).toStrictEqual([
    "performanceHudEnabled",
    "renderQualityPreset",
    "customPerformanceTargetFps",
  ]);

  const modeGroup = groupByTitle.get("Mode");
  expect(modeGroup).toBeTruthy();
  expect(
    modeGroup.controls.map((control) => control.key).slice(0, 4),
  ).toStrictEqual([
    "boundaryMode",
    ANALYSIS_MODE_BASE_KEY,
    "fieldCacheOverride",
    "colorMode",
  ]);
  const analysisModeControl = modeGroup.controls.find(
    (control) => control.key === ANALYSIS_MODE_BASE_KEY,
  );
  expect(analysisModeControl).toBeTruthy();
  expect(analysisModeControl.title).toBe(
    "Choose which analysis model drives the visuals. Modal Excitation is the true-to-nature resonant-mode model, and Legacy Peak keeps the older peak-driven behavior.",
  );
  expect(analysisModeControl.binding?.options).toStrictEqual({
    "Legacy Peak": "legacy-peak",
    "Modal Excitation": "modal-excitation",
  });
  expect(
    modeGroup.controls.find((control) => control.key === "fieldCacheOverride")
      ?.title,
  ).toBe(
    "Cached is faster and usually looks the same. Direct recomputes the field live instead of using the 3D cache, so it costs more.",
  );
  expect(
    !modeGroup.controls.some((control) =>
      ["renderQualityPreset", "customPerformanceTargetFps"].includes(
        control.key,
      ),
    ),
  ).toBe(true);

  const diagnosticsGroup = groupByTitle.get("Diagnostics");
  expect(diagnosticsGroup).toBeTruthy();
  expect(diagnosticsGroup.controls.map((control) => control.key)).toStrictEqual(
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
