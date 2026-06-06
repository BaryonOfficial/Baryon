import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  "boundaryMode",
  "densityGain",
  "absorption",
  "opacityGain",
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
  "cameraLocked",
  "bloomResponseBias",
  "rimBloomBias",
  "rimCompression",
  // Diagnostics
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
];

const CONTROLS_REFERENCE_URL = new URL(
  "../../../../documentation/public/reference/controls.md",
  import.meta.url,
);
const CONTROLS_REFERENCE = readFileSync(CONTROLS_REFERENCE_URL, "utf8");

function getPublicControlsReferenceHeading(group) {
  return group === "PresetsArea" ? "Inline Stage Controls" : group;
}

function readPublicControlsReferenceHeadings(controlsReference) {
  return Array.from(controlsReference.matchAll(/^## (.+)$/gm)).map(
    (match) => match[1],
  );
}

function readPublicControlsReferenceSectionLabels(controlsReference, heading) {
  const headingMarker = `## ${heading}`;
  const headingStart = controlsReference.indexOf(`${headingMarker}\n`);
  if (headingStart < 0) {
    return [];
  }
  const sectionStart = headingStart + headingMarker.length;
  const remainingReference = controlsReference.slice(sectionStart);
  const nextHeadingOffset = remainingReference.search(/\n## /);
  const section =
    nextHeadingOffset >= 0
      ? remainingReference.slice(0, nextHeadingOffset)
      : remainingReference;

  return Array.from(section.matchAll(/^\| \*\*(.+?)\*\*.*\|$/gm)).map(
    (match) => match[1],
  );
}

function getPublicControlsReferenceSchemaHeadings() {
  return Array.from(
    CONTROL_DEFINITIONS.reduce((groups, definition) => {
      if (definition.group) {
        groups.set(definition.group, definition.groupOrder);
      }
      return groups;
    }, new Map()),
  )
    .sort(([, leftOrder], [, rightOrder]) => leftOrder - rightOrder)
    .map(([group]) => getPublicControlsReferenceHeading(group));
}

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

  it("keeps the public controls reference aligned with grouped control labels", () => {
    for (const group of new Set(
      CONTROL_DEFINITIONS.map((definition) => definition.group).filter(Boolean),
    )) {
      const heading = getPublicControlsReferenceHeading(group);
      const expectedLabels = CONTROL_DEFINITIONS.filter(
        (definition) => definition.group === group,
      ).map((definition) => definition.label);
      const actualLabels = readPublicControlsReferenceSectionLabels(
        CONTROLS_REFERENCE,
        heading,
      );

      expect(actualLabels).toEqual(expectedLabels);
    }
  });

  it("orders public controls reference sections by schema group order", () => {
    const expectedHeadings = getPublicControlsReferenceSchemaHeadings();
    const actualSchemaHeadings = readPublicControlsReferenceHeadings(
      CONTROLS_REFERENCE,
    ).filter((heading) => expectedHeadings.includes(heading));

    expect(actualSchemaHeadings).toEqual(expectedHeadings);
  });

  it("defaults the raymarch surface to the current baseline", () => {
    const state = createControlState();

    expect(state.colorMode).toBe("static");
    expect(state.spectralMix).toBe(0.96);
    expect(state.volumeColor).toBe("#5be3f4");
    expect(state.surfaceColor).toBe("#f7fdff");
    expect(state.zeroPointPrecision).toBe(0.064);
    expect(state).not.toHaveProperty("structureMin");
    expect(state).not.toHaveProperty("structureMax");
    expect(state.boundaryMode).toBe("neumann");
    expect(state.raymarchSteps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(state.densityGain).toBe(4);
    expect(state.absorption).toBe(RAYMARCH_DEFAULTS.absorption);
    expect(state.opacityGain).toBe(3);
    expect(state).not.toHaveProperty("contourSharpness");
    expect(state.holographicIntensity).toBe(0.52);
    expect(state.holographicShift).toBe(0.42);
    expect(state.holographicFresnelPower).toBe(4.8);
    expect(state.bloomStrength).toBe(0.8);
    expect(state.bloomRadius).toBe(0);
    expect(state.bloomThreshold).toBe(0.12);
    expect(state.smaaEnabled).toBe(RENDER_DEFAULTS.smaaEnabled);
    expect(state.performanceHudEnabled).toBe(
      RENDER_DEFAULTS.performanceHudEnabled,
    );
    expect(state.renderQualityPreset).toBe(RENDER_DEFAULTS.renderQualityPreset);
    expect(state.customPerformanceTargetFps).toBe(
      RENDER_DEFAULTS.customPerformanceTargetFps,
    );
    expect(state.traaEnabled).toBe(RENDER_DEFAULTS.traaEnabled);
    expect(state.bloomResponseBias).toBe(1);
    expect(state.rimBloomBias).toBe(1.2);
    expect(state.rimCompression).toBe(1.2);
  });

  it("does not expose contour sharpness as a control", () => {
    const contourSharpness = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "contourSharpness",
    );

    expect(contourSharpness).toBeUndefined();
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

  it("exposes SMAA as a live diagnostics post-process toggle", () => {
    const smaaControl = CONTROL_DEFINITIONS.find(
      (definition) => definition.key === "smaaEnabled",
    );

    expect(smaaControl).toMatchObject({
      label: "SMAA",
      group: "Diagnostics",
      defaultValue: true,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.smaaEnabled",
      status: CONTROL_STATUSES.live,
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
      expect(definition.runtimePath).toEqual(expect.any(String));
      expect(definition.runtimePath).not.toBe("");
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
      defaultValue: 0.96,
      binding: { min: 0.01, max: 1, step: 0.01 },
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
    ]);
    expect(
      getControlsForFolder("Shape", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
      "zeroPointPrecision",
      "densityGain",
      "absorption",
      "opacityGain",
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
      getControlsForFolder("Diagnostics", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual([
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
    ]);
    expect(
      getControlsForFolder("Motion", DEFAULT_VISUALIZATION_METHOD).map(
        (definition) => definition.key,
      ),
    ).toEqual(["rotationSpeed", "reactivity", "motionAmount"]);
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
      methods: [VISUALIZATION_METHODS.raymarch],
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
