import { describe, expect, it } from "vitest";
import { buildExternalOutputItems } from "./ParticleDebugOverlay.jsx";

describe("ParticleDebugOverlay external output items", () => {
  it("returns null when external output diagnostics are unavailable", () => {
    expect(buildExternalOutputItems(null)).toBeNull();
    expect(buildExternalOutputItems({})).toBeNull();
  });

  it("builds compact Syphon OSR diagnostics rows", () => {
    expect(
      buildExternalOutputItems({
        renderMode: "legacy-double-render",
        frameSize: { width: 3840, height: 2160 },
        hasClients: true,
        syphon: {
          phase: "publishing",
          publishCount: 128,
          unhealthy: false,
          stallClassification: null,
          stallReason: null,
          renderProfile: {
            qualityPreset: "auto",
            renderScale: 1,
            traaEnabled: true,
          },
          osrPerfMetrics: {
            fps: 59.94,
            render: {
              renderScale: 1,
              traaEnabled: true,
            },
          },
        },
      }),
    ).toEqual([
      { label: "Render Mode", value: "legacy-double-render" },
      { label: "Output", value: "3840x2160" },
      { label: "Profile", value: "auto" },
      { label: "Req Scale", value: "1.000" },
      { label: "Live Scale", value: "1.000" },
      { label: "FPS", value: "59.9" },
      { label: "TRAA", value: "true" },
      { label: "Phase", value: "publishing" },
      { label: "Clients", value: "true" },
      { label: "Publishes", value: 128 },
      { label: "Stall", value: "none" },
    ]);
  });

  it("uses the operator-facing max quality label for the none profile", () => {
    expect(
      buildExternalOutputItems({
        frameSize: { width: 3840, height: 2160 },
        hasClients: false,
        syphon: {
          phase: "publishing",
          publishCount: 12,
          unhealthy: false,
          stallClassification: null,
          stallReason: null,
          renderProfile: {
            qualityPreset: "none",
            renderScale: 1,
            traaEnabled: true,
          },
          osrPerfMetrics: {
            fps: 60,
            render: {
              renderScale: 1,
              traaEnabled: true,
            },
          },
        },
      })?.find((item) => item.label === "Profile"),
    ).toEqual({
      label: "Profile",
      value: "Max Quality",
    });
  });
});
