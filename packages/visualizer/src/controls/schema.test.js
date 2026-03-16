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
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "../visualization/types.js";
import { CONTROL_RUNTIME_COVERAGE } from "./runtime.js";

const EXPECTED_CONTROL_KEYS = [
  "echoCancellation",
  "noiseSuppression",
  "autoGainControl",
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "bloomResponseBias",
  "backgroundColor",
  "outputMode",
  "outputBackgroundColor",
  "visualizationMethod",
  "volumeColor",
  "surfaceColor",
  "colorMode",
  "chromesthesiaMix",
  "rotationMode",
  "rotationSpeed",
  "reactivity",
  "zeroPointPrecision",
  "structureMin",
  "structureMax",
  "raymarchSteps",
  "densityGain",
  "absorption",
  "opacityGain",
  "contourSharpness",
  "rimBloomBias",
  "rimCompression",
  "motionAmount",
  "structurePersistence",
  "idleLogoIntensity",
  "idleLogoSize",
  "auditEnabled",
  "freezeModeSlots",
  "forceWebGLFallbackTest",
  "lowLoadPlaybackDiagnostics",
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

  it("defaults current controls to the raymarch method surface", () => {
    const methodControls = getControlsForMethod(DEFAULT_VISUALIZATION_METHOD);

    expect(DEFAULT_VISUALIZATION_METHOD).toBe(VISUALIZATION_METHODS.raymarch);
    expect(methodControls.map((definition) => definition.key)).toEqual([
      "echoCancellation",
      "noiseSuppression",
      "autoGainControl",
      "bloomEnabled",
      "bloomStrength",
      "bloomRadius",
      "bloomThreshold",
      "bloomResponseBias",
      "backgroundColor",
      "outputMode",
      "outputBackgroundColor",
      "visualizationMethod",
      "volumeColor",
      "surfaceColor",
      "colorMode",
      "chromesthesiaMix",
      "rotationMode",
      "rotationSpeed",
      "reactivity",
      "zeroPointPrecision",
      "structureMin",
      "structureMax",
      "raymarchSteps",
      "densityGain",
      "absorption",
      "opacityGain",
      "contourSharpness",
      "rimBloomBias",
      "rimCompression",
      "motionAmount",
      "structurePersistence",
      "idleLogoIntensity",
      "idleLogoSize",
      "auditEnabled",
      "freezeModeSlots",
      "forceWebGLFallbackTest",
      "lowLoadPlaybackDiagnostics",
      "injectTestTone",
      "testToneHz",
      "testToneAmplitude",
      "logEveryFrames",
    ]);
  });

  it("orders pane folders by user-facing groups", () => {
    expect(getControlFolders(DEFAULT_VISUALIZATION_METHOD)).toEqual([
      "Mic Processing",
      "Field",
      "Look",
      "Motion",
      "Advanced Field",
      "Advanced Look",
      "Diagnostics",
    ]);
  });

  it("assigns controls to the intended pane groups", () => {
    expect(
      getControlsForFolder("Field", DEFAULT_VISUALIZATION_METHOD).map(
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
    ]);
    expect(
      getControlsForFolder("Look", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "bloomEnabled",
      "bloomStrength",
      "bloomRadius",
      "bloomThreshold",
      "backgroundColor",
      "outputMode",
      "outputBackgroundColor",
      "visualizationMethod",
      "volumeColor",
      "surfaceColor",
      "colorMode",
      "chromesthesiaMix",
      "idleLogoIntensity",
      "idleLogoSize",
    ]);
    expect(
      getControlsForFolder("Motion", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "rotationMode",
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
    expect(cymatics2dControls).toContain("visualizationMethod");
    expect(cymatics2dControls).toContain("bloomThreshold");
    expect(cymatics2dControls).toContain("densityGain");
    expect(cymatics2dControls).toContain("structurePersistence");
    expect(getControlFolders(VISUALIZATION_METHODS.cymatics2d)).toEqual([
      "Mic Processing",
      "Field",
      "Look",
      "Motion",
      "Advanced Look",
      "Diagnostics",
    ]);
    expect(
      getControlsForFolder("Field", VISUALIZATION_METHODS.cymatics2d).map(
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
      getControlsForFolder("Look", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "bloomEnabled",
      "bloomStrength",
      "bloomRadius",
      "bloomThreshold",
      "backgroundColor",
      "outputMode",
      "outputBackgroundColor",
      "visualizationMethod",
      "volumeColor",
      "surfaceColor",
      "colorMode",
      "chromesthesiaMix",
      "idleLogoIntensity",
      "idleLogoSize",
    ]);
    expect(
      getControlsForFolder("Motion", VISUALIZATION_METHODS.cymatics2d).map(
        (definition) => definition.key,
      ),
    ).toEqual(["reactivity", "motionAmount", "structurePersistence"]);
  });

  it("keeps 3d-only debug controls scoped to the raymarch method", () => {
    const rimBloomBias = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "rimBloomBias",
    );
    const rimCompression = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "rimCompression",
    );

    expect(rimBloomBias?.methods).toEqual([VISUALIZATION_METHODS.raymarch]);
    expect(rimCompression?.methods).toEqual([VISUALIZATION_METHODS.raymarch]);
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
