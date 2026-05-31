import { createControlState } from "@baryon/visualizer/controls/schema";
import { expect, test } from "vitest";
import {
  SETTINGS_KEY,
  getVisibleControlLayout,
  persistControls,
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
  expect(modeGroup).toMatchObject({
    title: "Mode",
    controls: expect.any(Array),
  });
  expect(
    modeGroup.controls.map((control) => control.key).slice(0, 3),
  ).toStrictEqual(["boundaryMode", "colorMode", "rotationMode"]);
  expect(
    !modeGroup.controls.some((control) =>
      ["renderQualityPreset", "customPerformanceTargetFps"].includes(
        control.key,
      ),
    ),
  ).toBe(true);

  const diagnosticsGroup = groupByTitle.get("Diagnostics");
  expect(diagnosticsGroup).toMatchObject({
    title: "Diagnostics",
    controls: expect.any(Array),
  });
  expect(diagnosticsGroup.controls.map((control) => control.key)).toStrictEqual(
    [
      "traaEnabled",
      "auditEnabled",
      "freezeModeSlots",
      "forceWebGLFallbackTest",
      "lowLoadPlaybackDiagnostics",
      "cavityGeometry",
      "injectTestTone",
      "testToneHz",
      "testToneAmplitude",
      "logEveryFrames",
    ],
  );

  const displayGroup = groupByTitle.get("Display");
  expect(displayGroup).toMatchObject({
    title: "Display",
    controls: expect.any(Array),
  });
  expect(displayGroup.controls.map((control) => control.key)).toStrictEqual([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
    "backgroundColor",
    "outputBackgroundColor",
    "bloomResponseBias",
    "rimBloomBias",
    "rimCompression",
  ]);
});

test("operator control keys can surface Capture Debug Data without enabling all devtools controls", () => {
  const { folderGroups } = getVisibleControlLayout({
    devtoolsEnabled: false,
    method: "raymarch",
    operatorControlKeys: ["auditEnabled"],
  });
  const diagnosticsGroup = folderGroups.find(
    (group) => group.title === "Diagnostics",
  );

  expect(
    diagnosticsGroup?.controls.map((control) => control.key),
  ).toStrictEqual(["auditEnabled"]);
});

test("persistControls rewrites settings to the current schema and drops removed keys", () => {
  const storage = new Map([
    [
      SETTINGS_KEY,
      JSON.stringify({
        backgroundColor: "#010203",
        structuralImplementation: "legacy-peak",
        structureMin: 0.12,
        structureMax: 0.48,
      }),
    ],
  ]);
  const controls = {
    ...createControlState(),
    backgroundColor: "#102030",
  };

  persistControls(
    {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    controls,
  );

  expect(JSON.parse(storage.get(SETTINGS_KEY))).toMatchObject({
    backgroundColor: "#102030",
  });
  expect(JSON.parse(storage.get(SETTINGS_KEY))).not.toHaveProperty(
    "structuralImplementation",
  );
  expect(JSON.parse(storage.get(SETTINGS_KEY))).not.toHaveProperty(
    "structureMin",
  );
  expect(JSON.parse(storage.get(SETTINGS_KEY))).not.toHaveProperty(
    "structureMax",
  );
});
