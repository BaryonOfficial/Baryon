// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createControlsStore } from "./controlsStore.js";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

function restoreWindowDescriptor() {
  if (originalWindowDescriptor == null) {
    delete globalThis.window;
    return;
  }
  Object.defineProperty(globalThis, "window", originalWindowDescriptor);
}

describe("createControlsStore node storage guard", () => {
  afterEach(() => {
    restoreWindowDescriptor();
  });

  it("ignores ambient non-browser window aliases", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        document: {
          defaultView: globalThis,
        },
        get localStorage() {
          throw new Error("non-browser storage was read");
        },
      },
    });
    const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("node storage getter was read");
      },
    });

    let store = null;

    try {
      store = createControlsStore();

      expect(store.getSnapshot().presets).toEqual([]);
      expect(() => {
        store.updateControl("backgroundColor", "#123456", {
          persistMode: "immediate",
        });
      }).not.toThrow();
    } finally {
      store?.dispose();
      if (originalLocalStorageDescriptor == null) {
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(
          globalThis,
          "localStorage",
          originalLocalStorageDescriptor,
        );
      }
    }
  });
});
