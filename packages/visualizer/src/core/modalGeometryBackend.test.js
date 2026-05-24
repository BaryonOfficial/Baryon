import { describe, expect, it } from "vitest";
import { CAVITY_ACOUSTIC_DEFAULTS, SIMULATION_DEFAULTS } from "../defaults.js";
import { getModalGeometryBackend } from "./modalGeometryBackend.js";

describe("modal geometry backend", () => {
  it("solves pitch families against the acoustic scale instead of visual radius", () => {
    const backend = getModalGeometryBackend("rectangular");
    const [mode] = backend.solveTermsForPitch({
      pitch: 60,
      radius: SIMULATION_DEFAULTS.radius,
      acousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
      count: 1,
    });

    expect(mode).toMatchObject({
      boundaryMode: "neumann",
      acousticRadiusMeters: CAVITY_ACOUSTIC_DEFAULTS.radiusMeters,
      subfloorProjectionActive: false,
    });
    expect(mode.naturalFrequencyHz).toBeLessThanOrEqual(61);
  });

  it("builds modal atlas entries with acoustic natural frequencies", () => {
    const backend = getModalGeometryBackend("rectangular");
    const atlas = backend.buildAtlas({
      radius: SIMULATION_DEFAULTS.radius,
      acousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
      frequencyCenters: [{ centerHz: 60, familyWidth: 1 }],
      buildModeKey: (u, v, w) => `${u}:${v}:${w}`,
      createAtlasEntry({ candidate, naturalFrequencyHz }) {
        return { candidate, naturalFrequencyHz };
      },
    });

    expect(atlas).toHaveLength(1);
    expect(atlas[0].naturalFrequencyHz).toBeLessThanOrEqual(61);
    expect(atlas[0].candidate).toMatchObject({
      acousticRadiusMeters: CAVITY_ACOUSTIC_DEFAULTS.radiusMeters,
      subfloorProjectionActive: false,
    });
  });
});
