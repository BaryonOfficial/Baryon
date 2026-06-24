import { createControlState } from "@baryon/engine/controls/schema";
import { expect, test } from "vitest";
import {
  SETTINGS_KEY,
  getVisibleControlLayout,
  persistControls,
} from "./baryonControlsState.js";

test("builds the advanced controls presentation layout", () => {
  const { folderGroups, presetsAreaControls } = getVisibleControlLayout({
    controlsState: {
      ...createControlState(),
      colorMode: "spectral",
      outputMode: "opaque",
      renderQualityPreset: "custom",
      rotationMode: "manual",
    },
    devtoolsEnabled: true,
    method: "raymarch",
  });
  expect(folderGroups.map((group) => group.title)).toStrictEqual([
    "Performance",
    "Output",
    "Shape",
    "Color",
    "Motion",
    "Bloom",
    "Logo",
    "Diagnostics",
  ]);
  const groupByTitle = new Map(
    folderGroups.map((group) => [group.title, group]),
  );

  expect(presetsAreaControls.map((control) => control.key)).toStrictEqual([]);

  const performanceGroup = groupByTitle.get("Performance");
  expect(performanceGroup).toMatchObject({
    title: "Performance",
    controls: expect.any(Array),
  });
  expect(performanceGroup.controls.map((control) => control.key)).toStrictEqual(
    ["renderQualityPreset", "customTargetFps", "performanceHudEnabled"],
  );

  const outputGroup = groupByTitle.get("Output");
  expect(outputGroup).toMatchObject({
    title: "Output",
    controls: expect.any(Array),
  });
  expect(outputGroup.controls.map((control) => control.key)).toStrictEqual([
    "outputMode",
    "outputBackgroundColor",
  ]);

  const shapeGroup = groupByTitle.get("Shape");
  expect(shapeGroup).toMatchObject({
    title: "Shape",
    controls: expect.any(Array),
  });
  expect(shapeGroup.controls.map((control) => control.key)).toStrictEqual([
    "boundaryMode",
    "zeroPointPrecision",
    "densityGain",
    "absorption",
    "opacityGain",
    "raymarchSteps",
  ]);

  const colorGroup = groupByTitle.get("Color");
  expect(colorGroup).toMatchObject({
    title: "Color",
    controls: expect.any(Array),
  });
  expect(colorGroup.controls.map((control) => control.key)).toStrictEqual([
    "colorMode",
    "volumeColor",
    "surfaceColor",
    "spectralMix",
    "holographicIntensity",
    "holographicShift",
    "holographicFresnelPower",
  ]);

  const motionGroup = groupByTitle.get("Motion");
  expect(motionGroup).toMatchObject({
    title: "Motion",
    controls: expect.any(Array),
  });
  expect(motionGroup.controls.map((control) => control.key)).toStrictEqual([
    "rotationMode",
    "rotationSpeed",
    "motionAmount",
    "reactivity",
  ]);

  const diagnosticsGroup = groupByTitle.get("Diagnostics");
  expect(diagnosticsGroup).toMatchObject({
    title: "Diagnostics",
    controls: expect.any(Array),
  });
  expect(diagnosticsGroup.controls.map((control) => control.key)).toStrictEqual(
    [
      "traaEnabled",
      "smaaEnabled",
      "auditEnabled",
      "freezeModeSlots",
      "forceWebGLFallbackTest",
      "lowLoadPlaybackDiagnostics",
      "cavityGeometry",
      "injectTestTone",
      "testToneHz",
      "testToneSignal",
      "testToneAmplitude",
      "logEveryFrames",
    ],
  );

  const bloomGroup = groupByTitle.get("Bloom");
  expect(bloomGroup).toMatchObject({
    title: "Bloom",
    controls: expect.any(Array),
  });
  expect(bloomGroup.controls.map((control) => control.key)).toStrictEqual([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
    "bloomResponseBias",
    "rimBloomBias",
    "rimCompression",
  ]);
});

test("hides mode-dependent controls until their controlling value enables them", () => {
  const defaultLayout = getVisibleControlLayout({
    controlsState: createControlState(),
    devtoolsEnabled: true,
    method: "raymarch",
  });
  const defaultControls = defaultLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  expect(defaultControls).not.toContain("customTargetFps");
  expect(defaultControls).not.toContain("outputBackgroundColor");
  expect(defaultControls).not.toContain("rotationSpeed");
  expect(defaultControls).not.toContain("spectralMix");

  const expandedLayout = getVisibleControlLayout({
    controlsState: {
      ...createControlState(),
      colorMode: "spectral",
      outputMode: "opaque",
      renderQualityPreset: "custom",
      rotationMode: "manual",
    },
    devtoolsEnabled: true,
    method: "raymarch",
  });
  const expandedControls = expandedLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  expect(expandedControls).toContain("customTargetFps");
  expect(expandedControls).toContain("outputBackgroundColor");
  expect(expandedControls).toContain("rotationSpeed");
  expect(expandedControls).toContain("spectralMix");
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
  ).toStrictEqual(["smaaEnabled", "auditEnabled"]);
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
