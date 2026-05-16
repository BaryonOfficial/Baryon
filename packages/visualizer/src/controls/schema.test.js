import { describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
  getControlsForMethod,
} from "./schema.js";
import { auditControlSchema } from "./audit.js";
import { RAYMARCH_DEFAULTS, RENDER_DEFAULTS } from "../defaults.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "../visualization/types.js";
import { CONTROL_RUNTIME_COVERAGE } from "./runtime.js";

const EXPECTED_CONTROL_KEYS = [
  // Live Input
  "liveInputAnalysisClass",
  "liveInputAcousticIntent",
  "echoCancellation",
  "noiseSuppression",
  "autoGainControl",
  // Shape
  "zeroPointPrecision",
  "structureMin",
  "structureMax",
  "boundaryMode",
  "densityGain",
  "absorption",
  "opacityGain",
  "contourSharpness",
  "raymarchSteps",
  // Color
  "volumeColor",
  "surfaceColor",
  "colorMode",
  "spectralMix",
  "holographicIntensity",
  "holographicShift",
  "holographicFresnelPower",
  // Logo
  "idleLogoIntensity",
  "idleLogoSize",
  // Motion
  "rotationMode",
  "rotationSpeed",
  "reactivity",
  "motionAmount",
  "structurePersistence",
  // Display
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "backgroundColor",
  "renderQualityPreset",
  "customPerformanceTargetFps",
  "outputMode",
  "outputBackgroundColor",
  // PresetsArea (rendered inline in Presets, but defined here in file order)
  "performanceHudEnabled",
  // Display (continued)
  "visualizationMethod",
  "bloomResponseBias",
  "rimBloomBias",
  "rimCompression",
  // Diagnostics
  "auditEnabled",
  "freezeModeSlots",
  "forceWebGLFallbackTest",
  "lowLoadPlaybackDiagnostics",
  "fieldCacheOverride",
  "cavityGeometry",
  "injectTestTone",
  "testToneHz",
  "testToneAmplitude",
  "logEveryFrames",
];

describe("control schema", () => {
  it("enumerates the current pane surface", () => {
    expect(CONTROL_DEFINITIONS.map((definition) => definition.key)).toEqual(
      EXPECTED_CONTROL_KEYS,
    );
  });

  it("creates state for every control key", () => {
    const state = createControlState();
    expect(Object.keys(state)).toEqual(EXPECTED_CONTROL_KEYS);
  });

  it("defaults the raymarch surface to the tuned cyan laser baseline", () => {
    const state = createControlState();

    expect(state.colorMode).toBe("spectral");
    expect(state.spectralMix).toBe(1);
    expect(state.volumeColor).toBe("#56d7ff");
    expect(state.surfaceColor).toBe("#f7fdff");
    expect(state.zeroPointPrecision).toBe(0.02);
    expect(state.structureMin).toBe(0.3);
    expect(state.structureMax).toBe(0.35);
    expect(state.boundaryMode).toBe("neumann");
    expect(state.raymarchSteps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(state.densityGain).toBe(3.25);
    expect(state.absorption).toBe(RAYMARCH_DEFAULTS.absorption);
    expect(state.opacityGain).toBe(3);
    expect(state.contourSharpness).toBe(8);
    expect(state.holographicIntensity).toBe(0.61);
    expect(state.holographicShift).toBe(0.35);
    expect(state.holographicFresnelPower).toBe(3.2);
    expect(state.bloomStrength).toBe(1.07);
    expect(state.bloomRadius).toBe(0);
    expect(state.bloomThreshold).toBe(0.3);
    expect(state.performanceHudEnabled).toBe(
      RENDER_DEFAULTS.performanceHudEnabled,
    );
    expect(state.renderQualityPreset).toBe(RENDER_DEFAULTS.renderQualityPreset);
    expect(state.customPerformanceTargetFps).toBe(
      RENDER_DEFAULTS.customPerformanceTargetFps,
    );
    expect(state.bloomResponseBias).toBe(0.52);
  });

  it("keeps the node-threshold slider wide enough for cymatic tuning", () => {
    const nodeThreshold = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "zeroPointPrecision",
    );

    expect(nodeThreshold?.binding).toMatchObject({
      min: 0.001,
      max: 0.3,
      step: 0.001,
    });
  });

  it("treats background color as the presentation backdrop", () => {
    const backgroundControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "backgroundColor",
    );

    expect(backgroundControl?.runtimePath).toBe("ui.backdropColor");
    expect(backgroundControl?.title).toMatch(/backdrop/i);
  });

  it("labels the highest performance profile as Max Quality", () => {
    const performanceProfileControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "renderQualityPreset",
    );

    expect(performanceProfileControl?.title).toContain("Max Quality");
    expect(performanceProfileControl?.binding).toMatchObject({
      options: {
        Auto: "auto",
        Custom: "custom",
        "Max Quality": "max-quality",
      },
    });
  });

  it("defines program output controls separately from the preview backdrop", () => {
    const outputModeControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "outputMode",
    );
    const outputFillControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "outputBackgroundColor",
    );

    expect(outputModeControl?.runtimePath).toBe("program.outputMode");
    expect(outputFillControl?.runtimePath).toBe("program.backgroundColor");
  });

  it("exposes a debug selector for 3d field evaluation mode", () => {
    const fieldCacheOverrideControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "fieldCacheOverride",
    );

    expect(fieldCacheOverrideControl).toMatchObject({
      label: "3D Field Eval",
      defaultValue: "cached",
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "controls.fieldCacheOverride",
      status: CONTROL_STATUSES.debugOnly,
      methods: [VISUALIZATION_METHODS.raymarch],
    });
    expect(fieldCacheOverrideControl?.binding?.options).toEqual({
      Direct: "direct",
      Cached: "cached",
    });
  });

  it("exposes cavity geometry as a debug-only requested-state control", () => {
    const cavityGeometryControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "cavityGeometry",
    );

    expect(cavityGeometryControl).toMatchObject({
      label: "Cavity Geometry",
      defaultValue: "rectangular",
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.requestedCavityGeometry",
      status: CONTROL_STATUSES.debugOnly,
      methods: [VISUALIZATION_METHODS.raymarch],
    });
    expect(cavityGeometryControl?.binding?.options).toEqual({
      Rectangular: "rectangular",
      Spherical: "spherical",
    });
  });

  it("has a valid audit report", () => {
    const report = auditControlSchema();
    expect(report.isValid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("classifies every control consistently", () => {
    for (const definition of CONTROL_DEFINITIONS) {
      expect(Object.values(CONTROL_TARGET_TYPES)).toContain(
        definition.targetType,
      );
      expect(Object.values(CONTROL_HANDLERS)).toContain(definition.handler);
      expect(Object.values(CONTROL_STATUSES)).toContain(definition.status);
      expect(definition.methods.length).toBeGreaterThan(0);
      expect(
        definition.methods.every((method) =>
          Object.values(VISUALIZATION_METHODS).includes(method),
        ),
      ).toBe(true);
      expect(definition.runtimePath).toBeTruthy();
    }
  });

  it("exposes Spectral Light as the live dynamic color mode", () => {
    const colorMode = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "colorMode",
    );
    const spectralMix = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "spectralMix",
    );

    expect(colorMode?.binding?.options).toEqual({
      Static: "static",
      Spectral: "spectral",
    });
    expect(colorMode?.runtimePath).toBe("runtime.spectralLight.colorMode");
    expect(spectralMix).toMatchObject({
      label: "Color Mix",
      defaultValue: 1,
      runtimePath: "runtime.uniforms.uSpectralMix.value",
    });
  });

  it("defaults current controls to the raymarch method surface", () => {
    const methodControls = getControlsForMethod(DEFAULT_VISUALIZATION_METHOD);

    expect(DEFAULT_VISUALIZATION_METHOD).toBe(VISUALIZATION_METHODS.raymarch);
    expect(methodControls.map((definition) => definition.key)).toEqual(
      EXPECTED_CONTROL_KEYS,
    );
  });

  it("orders pane folders by user-facing groups", () => {
    expect(getControlFolders(DEFAULT_VISUALIZATION_METHOD)).toEqual([
      "Mode",
      "Shape",
      "Color",
      "Logo",
      "Motion",
      "Display",
      "PresetsArea",
      "Diagnostics",
    ]);
  });

  it("assigns controls to the intended pane groups", () => {
    expect(
      getControlsForFolder("Mode", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "boundaryMode",
      "colorMode",
      "rotationMode",
      "renderQualityPreset",
      "customPerformanceTargetFps",
      "outputMode",
      "visualizationMethod",
    ]);
    expect(
      getControlsForFolder("Shape", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "zeroPointPrecision",
      "structureMin",
      "structureMax",
      "densityGain",
      "absorption",
      "opacityGain",
      "contourSharpness",
      "raymarchSteps",
    ]);
    expect(
      getControlsForFolder("Color", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "volumeColor",
      "surfaceColor",
      "spectralMix",
      "holographicIntensity",
      "holographicShift",
      "holographicFresnelPower",
    ]);
    expect(
      getControlsForFolder("Logo", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual(["idleLogoIntensity", "idleLogoSize"]);
    expect(
      getControlsForFolder("Display", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
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
    expect(
      getControlsForFolder("PresetsArea", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual(["performanceHudEnabled"]);
    expect(
      getControlsForFolder("Motion", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "rotationSpeed",
      "reactivity",
      "motionAmount",
      "structurePersistence",
    ]);
  });

  it("maps every live control to runtime coverage", () => {
    const liveKeys = CONTROL_DEFINITIONS.filter(
      (definition) => definition.status === CONTROL_STATUSES.live,
    ).map((definition) => definition.key);
    const coveredKeys = Object.values(CONTROL_RUNTIME_COVERAGE).flat();

    for (const key of liveKeys) {
      expect(coveredKeys).toContain(key);
    }
  });

  it("filters out 3d-only controls from the fullscreen 2d method", () => {
    const cymatics2dControls = getControlsForMethod(
      VISUALIZATION_METHODS.cymatics2d,
    ).map((definition) => definition.key);

    expect(getControlsForMethod(VISUALIZATION_METHODS.cymatics2d)).not.toEqual(
      getControlsForMethod(VISUALIZATION_METHODS.raymarch),
    );
    expect(cymatics2dControls).not.toContain("rotationMode");
    expect(cymatics2dControls).not.toContain("rotationSpeed");
    expect(cymatics2dControls).not.toContain("raymarchSteps");
    expect(cymatics2dControls).not.toContain("absorption");
    expect(cymatics2dControls).not.toContain("rimBloomBias");
    expect(cymatics2dControls).not.toContain("rimCompression");
    expect(cymatics2dControls).not.toContain("holographicIntensity");
    expect(cymatics2dControls).not.toContain("holographicShift");
    expect(cymatics2dControls).not.toContain("holographicFresnelPower");
    expect(cymatics2dControls).toContain("visualizationMethod");
    expect(cymatics2dControls).toContain("bloomThreshold");
    expect(cymatics2dControls).toContain("densityGain");
    expect(cymatics2dControls).toContain("boundaryMode");
    expect(cymatics2dControls).toContain("structurePersistence");
    expect(getControlFolders(VISUALIZATION_METHODS.cymatics2d)).toEqual([
      "Mode",
      "Shape",
      "Color",
      "Logo",
      "Motion",
      "Display",
      "PresetsArea",
      "Diagnostics",
    ]);
    expect(
      getControlsForFolder("Shape", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "zeroPointPrecision",
      "structureMin",
      "structureMax",
      "densityGain",
      "opacityGain",
      "contourSharpness",
    ]);
    expect(
      getControlsForFolder("Mode", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "boundaryMode",
      "colorMode",
      "renderQualityPreset",
      "customPerformanceTargetFps",
      "outputMode",
      "visualizationMethod",
    ]);
    expect(
      getControlsForFolder("Color", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual(["volumeColor", "surfaceColor", "spectralMix"]);
    expect(
      getControlsForFolder("Logo", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual(["idleLogoIntensity", "idleLogoSize"]);
    expect(
      getControlsForFolder("Display", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "bloomEnabled",
      "bloomStrength",
      "bloomRadius",
      "bloomThreshold",
      "backgroundColor",
      "outputBackgroundColor",
      "bloomResponseBias",
    ]);
    expect(
      getControlsForFolder("PresetsArea", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual(["performanceHudEnabled"]);
    expect(
      getControlsForFolder("Motion", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual(["reactivity", "motionAmount", "structurePersistence"]);
  });

  it("keeps fine-grained glow controls live while preserving method scope", () => {
    const bloomResponseBias = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "bloomResponseBias",
    );
    const rimBloomBias = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "rimBloomBias",
    );
    const rimCompression = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "rimCompression",
    );
    const holographicIntensity = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "holographicIntensity",
    );
    const holographicShift = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "holographicShift",
    );
    const holographicFresnelPower = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "holographicFresnelPower",
    );

    expect(bloomResponseBias).toMatchObject({
      group: "Display",
      status: CONTROL_STATUSES.live,
      methods: [VISUALIZATION_METHODS.raymarch, VISUALIZATION_METHODS.cymatics2d],
    });
    expect(rimBloomBias).toMatchObject({
      group: "Display",
      status: CONTROL_STATUSES.live,
      methods: [VISUALIZATION_METHODS.raymarch],
    });
    expect(rimCompression).toMatchObject({
      group: "Display",
      status: CONTROL_STATUSES.live,
      methods: [VISUALIZATION_METHODS.raymarch],
    });
    expect(holographicIntensity?.methods).toEqual([
      VISUALIZATION_METHODS.raymarch,
    ]);
    expect(holographicShift?.methods).toEqual([VISUALIZATION_METHODS.raymarch]);
    expect(holographicFresnelPower?.methods).toEqual([
      VISUALIZATION_METHODS.raymarch,
    ]);
  });

  it("fails audit when a live control lacks runtime coverage", () => {
    const report = auditControlSchema(CONTROL_DEFINITIONS, {
      ...CONTROL_RUNTIME_COVERAGE,
      [CONTROL_HANDLERS.raymarch]: CONTROL_RUNTIME_COVERAGE[
        CONTROL_HANDLERS.raymarch
      ].filter((key) => key !== "densityGain"),
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContain(
      "Control densityGain is missing runtime coverage",
    );
  });
});
