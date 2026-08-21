import {
  CONTROL_DEFINITIONS,
  CONTROL_SURFACES,
  createControlState,
} from "@baryon/engine/controls/schema";
import { expect, test } from "vitest";
import {
  SETTINGS_KEY,
  controlMatchesSettingsSurface,
  getVisibleControlLayout,
  persistControls,
} from "./baryonControlsState.js";

function getListenerControlLayout(options = {}) {
  return getVisibleControlLayout({
    ...options,
    surface: CONTROL_SURFACES.listener,
  });
}

test("builds the advanced controls presentation layout", () => {
  const { folderGroups, presetsAreaControls } = getListenerControlLayout({
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
    "Volume",
    "Appearance",
    "Motion",
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
    "outputBackgroundColor",
  ]);
  expect(outputGroup.controls[0].label).toBe("Output Color");

  const volumeGroup = groupByTitle.get("Volume");
  expect(volumeGroup).toMatchObject({
    title: "Volume",
    controls: expect.any(Array),
  });
  expect(volumeGroup.controls.map((control) => control.key)).toStrictEqual([
    "volumeShape",
    "boundaryMode",
    "densityGain",
    "laserDeflectionGain",
    "raymarchSteps",
  ]);
  expect(volumeGroup.controls[0]).toMatchObject({
    key: "volumeShape",
    label: "Shape",
  });
  expect(volumeGroup.title).not.toBe(volumeGroup.controls[0].label);

  const appearanceGroup = groupByTitle.get("Appearance");
  expect(appearanceGroup).toMatchObject({
    title: "Appearance",
    controls: expect.any(Array),
  });
  expect(appearanceGroup.controls.map((control) => control.key)).toStrictEqual([
    "colorMode",
    "volumeColor",
    "surfaceColor",
    "spectralChroma",
    "holographicIntensity",
    "holographicFresnelPower",
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
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
    "patternPersistenceSeconds",
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
      "suppressPlaybackTelemetry",
      "injectTestTone",
      "testToneHz",
      "testToneSignal",
      "testToneAmplitude",
      "logEveryFrames",
    ],
  );

  const logoGroup = groupByTitle.get("Logo");
  expect(logoGroup).toMatchObject({
    title: "Logo",
    controls: expect.any(Array),
  });
  expect(logoGroup.controls.map((control) => control.key)).toStrictEqual([
    "idleLogoIntensity",
    "idleLogoSize",
    "idleLogoColor",
    "idleLogoRotationMode",
    "idleLogoRotationSpeed",
  ]);
});

test("hides mode-dependent controls until their controlling value enables them", () => {
  const defaultLayout = getListenerControlLayout({
    controlsState: createControlState(),
    devtoolsEnabled: true,
    method: "raymarch",
  });
  const defaultControls = defaultLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  // Disabled rotation and the max-quality preset are baseline defaults, so
  // their dependent controls start hidden. Spectral colour is the baseline, so
  // its spectral presentation controls start visible.
  expect(defaultControls).not.toContain("customTargetFps");
  expect(defaultControls).toContain("outputBackgroundColor");
  expect(defaultControls).not.toContain("rotationSpeed");
  expect(defaultControls).toContain("idleLogoRotationSpeed");
  expect(defaultControls).toContain("spectralChroma");

  const staticColorLayout = getListenerControlLayout({
    controlsState: {
      ...createControlState(),
      colorMode: "static",
    },
    devtoolsEnabled: true,
    method: "raymarch",
  });
  const staticColorControls = staticColorLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  expect(staticColorControls).not.toContain("spectralChroma");

  const expandedLayout = getListenerControlLayout({
    controlsState: {
      ...createControlState(),
      colorMode: "spectral",
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
  expect(expandedControls).toContain("idleLogoRotationSpeed");
  expect(expandedControls).toContain("spectralChroma");

  const idleLogoOffLayout = getListenerControlLayout({
    controlsState: {
      ...createControlState(),
      idleLogoRotationMode: "off",
    },
    devtoolsEnabled: true,
    method: "raymarch",
  });
  const idleLogoOffControls = idleLogoOffLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  expect(idleLogoOffControls).not.toContain("idleLogoRotationSpeed");
});

test("operator control keys can surface Capture Debug Data without enabling all devtools controls", () => {
  const { folderGroups } = getListenerControlLayout({
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

test("a product surface can hide controls it does not own", () => {
  const options = {
    controlsState: createControlState(),
    devtoolsEnabled: true,
    method: "raymarch",
  };
  const listenerLayout = getVisibleControlLayout({
    ...options,
    surface: CONTROL_SURFACES.listener,
  });
  const performerLayout = getVisibleControlLayout({
    ...options,
    surface: CONTROL_SURFACES.performer,
  });
  const listenerKeys = listenerLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );
  const performerKeys = performerLayout.folderGroups.flatMap((group) =>
    group.controls.map((control) => control.key),
  );

  expect(listenerKeys).toContain("outputBackgroundColor");
  expect(performerKeys).not.toContain("outputBackgroundColor");
  expect(performerLayout.folderGroups.map((group) => group.title)).not.toContain(
    "Output",
  );
});

test("requires a recognized settings surface", () => {
  const options = { devtoolsEnabled: true, method: "raymarch" };

  expect(() => getVisibleControlLayout(options)).toThrow(TypeError);
  expect(() => getVisibleControlLayout({ ...options, surface: null })).toThrow(
    TypeError,
  );
  expect(() =>
    getVisibleControlLayout({ ...options, surface: "desktop" }),
  ).toThrow(TypeError);
});

test("remote exclusions do not alter normal settings-surface ownership", () => {
  const sourceDefinition = CONTROL_DEFINITIONS.find(
    (definition) => definition.key === "volumeShape",
  );
  const supportedExcluded = {
    ...sourceDefinition,
    remoteControl: { excludedReason: "operator-only" },
  };
  const unsupportedExcluded = {
    ...sourceDefinition,
    defaultValue: "unsupported-contract",
    binding: undefined,
    remoteControl: { excludedReason: "unsupported-value-contract" },
  };

  expect(
    controlMatchesSettingsSurface(
      supportedExcluded,
      CONTROL_SURFACES.listener,
    ),
  ).toBe(true);
  expect(
    controlMatchesSettingsSurface(
      unsupportedExcluded,
      CONTROL_SURFACES.listener,
    ),
  ).toBe(true);
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
    new Set(["backgroundColor"]),
  );

  expect(JSON.parse(storage.get(SETTINGS_KEY))).toEqual({
    version: 6,
    controls: {
      backgroundColor: "#102030",
    },
  });
  expect(JSON.parse(storage.get(SETTINGS_KEY)).controls).not.toHaveProperty(
    "structuralImplementation",
  );
  expect(JSON.parse(storage.get(SETTINGS_KEY)).controls).not.toHaveProperty(
    "structureMin",
  );
  expect(JSON.parse(storage.get(SETTINGS_KEY)).controls).not.toHaveProperty(
    "structureMax",
  );
});
