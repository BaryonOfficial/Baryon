import { describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
  createControlState,
} from "./schema.js";
import { auditControlSchema } from "./audit.js";

const EXPECTED_CONTROL_KEYS = [
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "backgroundColor",
  "volumeColor",
  "surfaceColor",
  "particleSpeed",
  "particleSize",
  "rotationSpeed",
  "flowFieldStrength",
  "flowFieldFrequency",
  "flowFieldInfluence",
  "targetLerpThreshold",
  "zeroPointPrecision",
  "surfaceParticles",
  "particleMovementType",
  "idleLogoIntensity",
  "idleLogoAlpha",
  "idleLogoSize",
  "auditEnabled",
  "freezeModeSlots",
  "injectTestTone",
  "pitchSourceMode",
  "testToneHz",
  "testToneAmplitude",
  "logEveryFrames",
];

describe("control schema", () => {
  it("enumerates the current pane surface", () => {
    expect(CONTROL_DEFINITIONS.map((definition) => definition.key)).toEqual(
      EXPECTED_CONTROL_KEYS
    );
  });

  it("creates state for every control key", () => {
    const state = createControlState();
    expect(Object.keys(state)).toEqual(EXPECTED_CONTROL_KEYS);
  });

  it("has a valid audit report", () => {
    const report = auditControlSchema();
    expect(report.isValid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("classifies every control consistently", () => {
    for (const definition of CONTROL_DEFINITIONS) {
      expect(Object.values(CONTROL_TARGET_TYPES)).toContain(definition.targetType);
      expect(Object.values(CONTROL_HANDLERS)).toContain(definition.handler);
      expect(Object.values(CONTROL_STATUSES)).toContain(definition.status);
      expect(definition.runtimePath).toBeTruthy();
    }
  });
});
