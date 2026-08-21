import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DiagnosticsHud from "./DiagnosticsHud.jsx";
import {
  normalizeDiagnosticsHudItems,
  reconcileDiagnosticsHudState,
  resolveDiagnosticsHudState,
  shouldRenderDiagnosticsHud,
} from "./DiagnosticsHudState.js";

function createDiagnosticsSnapshot(overrides = {}) {
  return {
    visualizationMethod: "raymarch",
    structureSignal: 0.5,
    changeSignal: 0.25,
    modeSlotCount: 3,
    raymarchDebug: {
      fieldState: "active",
      modeCoherence: 0.75,
      stepBudget: 72,
      volumeVisible: true,
      modalDescriptorOverflow: false,
    },
    ...overrides,
  };
}

describe("normalizeDiagnosticsHudItems", () => {
  it("returns null when none are provided", () => {
    expect(normalizeDiagnosticsHudItems(null)).toBeNull();
    expect(normalizeDiagnosticsHudItems(undefined)).toBeNull();
    expect(normalizeDiagnosticsHudItems([])).toBeNull();
  });

  it("passes through non-empty host-provided items", () => {
    const items = [{ label: "Authority", value: "local-presented" }];
    expect(normalizeDiagnosticsHudItems(items)).toBe(items);
  });
});

describe("resolveDiagnosticsHudState", () => {
  it("prefers authoritative overrides over stale local state", () => {
    expect(
      resolveDiagnosticsHudState({
        localState: {
          enabled: true,
          snapshot: { visualizationMethod: "raymarch" },
        },
        enabledOverride: false,
        snapshotOverride: null,
      }),
    ).toStrictEqual({
      enabled: false,
      snapshot: null,
    });
  });
});

describe("reconcileDiagnosticsHudState", () => {
  it("preserves identity while disabled diagnostics stay unchanged", () => {
    const currentState = { enabled: false, snapshot: null };

    expect(
      reconcileDiagnosticsHudState(currentState, {
        enabled: false,
        snapshot: null,
      }),
    ).toBe(currentState);
  });

  it("accepts a newly published diagnostics snapshot", () => {
    const currentState = { enabled: false, snapshot: null };
    const snapshot = createDiagnosticsSnapshot();

    expect(
      reconcileDiagnosticsHudState(currentState, {
        enabled: true,
        snapshot,
      }),
    ).toStrictEqual({ enabled: true, snapshot });
  });
});

describe("shouldRenderDiagnosticsHud", () => {
  it("allows authoritative override rendering even when devtools are disabled", () => {
    expect(
      shouldRenderDiagnosticsHud({
        devtoolsEnabled: false,
        enabledOverride: true,
        diagnosticsHudState: {
          enabled: true,
          snapshot: { visualizationMethod: "raymarch" },
        },
      }),
    ).toBe(true);
  });
});

describe("DiagnosticsHud", () => {
  it("renders post-process anti-aliasing diagnostics", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DiagnosticsHud, {
        enabledOverride: true,
        snapshotOverride: createDiagnosticsSnapshot(),
        postProcessMetrics: {
          visualizationMethod: "raymarch",
          traaEnabled: true,
          smaaEnabled: true,
          temporalHistoryBlend: 0.5,
        },
      }),
    );

    expect(markup).toContain('data-testid="diagnostics-hud"');
    expect(markup).toContain("Post Process");
    expect(markup).toContain("TRAA");
    expect(markup).toContain("on · blend 0.50");
    expect(markup).toContain("SMAA");
    expect(markup).toContain("on");
  });

  it("presents field and output contracts as readable grouped diagnostics", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DiagnosticsHud, {
        enabledOverride: true,
        snapshotOverride: createDiagnosticsSnapshot(),
        diagnosticsHudExtraItems: [
          { label: "Render Mode", value: "local-gpu-preview" },
        ],
      }),
    );

    expect(markup).toContain("Field Pipeline");
    expect(markup).toContain("Complete modal Gor&#x27;kov field");
    expect(markup).toContain("Fixed scale-space");
    expect(markup).toContain("Persistent topology");
    expect(markup).toContain("U0 observer");
    expect(markup).toContain("local gpu preview");
    expect(markup).not.toContain(
      "complete-modal-gorkov-field-fixed-scale-space-persistent-topology-u0-observer",
    );
  });

  it("does not render non-finite diagnostics as numeric values", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DiagnosticsHud, {
        enabledOverride: true,
        snapshotOverride: createDiagnosticsSnapshot({
          structureSignal: Number.POSITIVE_INFINITY,
          changeSignal: Number.NaN,
          raymarchDebug: {
            fieldState: "active",
            modeCoherence: Number.NEGATIVE_INFINITY,
            stepBudget: 72,
            volumeVisible: true,
            modalDescriptorOverflow: false,
          },
        }),
      }),
    );

    expect(markup).toContain("Structure");
    expect(markup).toContain("n/a");
    expect(markup).not.toContain("Infinity");
    expect(markup).not.toContain("NaN");
  });
});
