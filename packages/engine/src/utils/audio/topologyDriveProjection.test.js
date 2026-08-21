import { describe, expect, it } from "vitest";

import {
  createTopologyDriveProjection,
  refreshTopologyDriveProjection,
} from "./topologyDriveProjection.js";

describe("topology drive projection", () => {
  it("keeps the continuity handoff envelope on fast coefficient refreshes", () => {
    const committedModes = [
      {
        modeKey: "1:2:3",
        u: 1,
        v: 2,
        w: 3,
        layer: "source-coupled",
        projectionAmplitudeScale: 0.25,
      },
    ];
    const state = {
      committedModes,
      topologyDriveProjection: createTopologyDriveProjection(
        { activeModeCount: 1 },
        committedModes,
      ),
      featureState: {
        analysis: {
          modalExcitationState: {
            activeModes: new Map([
              [
                "1:2:3",
                {
                  displayAmplitude: 0.8,
                  modalResponseEnergy: 0.64,
                  modalResponseDrive: 0.64,
                },
              ],
            ]),
            modalCandidateState: new Map(),
            observedModes: new Map(),
          },
        },
      },
    };

    refreshTopologyDriveProjection(state);

    expect(state.topologyDriveProjection.committedDisplaySlots[3]).toBeCloseTo(
      0.2,
      8,
    );
    expect(state.topologyDriveProjection.committedSignalSlots[3]).toBeCloseTo(
      0.2,
      8,
    );
  });

  it("never promotes observer confidence into a field coefficient", () => {
    const committedModes = [
      {
        modeKey: "1:2:3",
        u: 1,
        v: 2,
        w: 3,
        layer: "source-coupled",
        projectionAmplitudeScale: 1,
      },
    ];
    const state = {
      committedModes,
      topologyDriveProjection: createTopologyDriveProjection(
        { activeModeCount: 1 },
        committedModes,
      ),
      featureState: {
        analysis: {
          modalExcitationState: {
            activeModes: new Map(),
            modalCandidateState: new Map(),
            observedModes: new Map([
              [
                "1:2:3",
                {
                  observationConfidence: 0.9,
                  amplitude: 0.9,
                  displayProjectionAmplitude: 0.9,
                },
              ],
            ]),
          },
        },
      },
    };

    refreshTopologyDriveProjection(state);

    expect(state.topologyDriveProjection.committedDisplaySlots[3]).toBe(0);
    expect(state.topologyDriveProjection.committedSignalSlots[3]).toBe(0);
  });
});
