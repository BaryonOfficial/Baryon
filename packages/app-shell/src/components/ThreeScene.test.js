import { describe, expect, it } from "vitest";
import { resolveLiveInputPanelConfig } from "./ThreeScene.jsx";

describe("resolveLiveInputPanelConfig", () => {
  it("defaults to the web selector without forcing visibility", () => {
    expect(resolveLiveInputPanelConfig()).toEqual({
      forceVisible: false,
      showAction: false,
      deviceSelectTestId: "live-input-device-select",
    });
  });

  it("prefers the host-neutral config object", () => {
    expect(
      resolveLiveInputPanelConfig({
        liveInputPanel: {
          forceVisible: true,
          showAction: true,
          deviceSelectTestId: "performer-live-device-select",
        },
      }),
    ).toEqual({
      forceVisible: true,
      showAction: true,
      deviceSelectTestId: "performer-live-device-select",
    });
  });

  it("fills in the default selector id when omitted", () => {
    expect(
      resolveLiveInputPanelConfig({
        liveInputPanel: {
          forceVisible: true,
          showAction: true,
        },
      }),
    ).toEqual({
      forceVisible: true,
      showAction: true,
      deviceSelectTestId: "live-input-device-select",
    });
  });
});
