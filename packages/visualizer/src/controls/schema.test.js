import { describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
  createControlState,
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
  "volumeColor",
  "surfaceColor",
  "rotationSpeed",
  "zeroPointPrecision",
  "structureMin",
  "structureMax",
  "raymarchSteps",
  "densityGain",
  "absorption",
  "contourSharpness",
  "rimBloomBias",
  "rimCompression",
  "beatSensitivity",
  "pulseAmount",
  "pulseDecayMs",
  "idleLogoIntensity",
  "idleLogoSize",
  "auditEnabled",
  "freezeModeSlots",
  "forceWebGLFallbackTest",
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
      "volumeColor",
      "surfaceColor",
      "rotationSpeed",
      "zeroPointPrecision",
      "structureMin",
      "structureMax",
      "raymarchSteps",
      "densityGain",
      "absorption",
      "contourSharpness",
      "rimBloomBias",
      "rimCompression",
      "beatSensitivity",
      "pulseAmount",
      "pulseDecayMs",
      "idleLogoIntensity",
      "idleLogoSize",
      "auditEnabled",
      "freezeModeSlots",
      "forceWebGLFallbackTest",
      "injectTestTone",
      "testToneHz",
      "testToneAmplitude",
      "logEveryFrames",
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
