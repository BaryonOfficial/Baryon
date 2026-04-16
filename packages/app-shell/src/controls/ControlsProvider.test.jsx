// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createControlsStore } from "./controlsStore.js";

const markBaryonTestControlsReady = vi.fn();
const resetBaryonTestReady = vi.fn();

vi.mock("../devtools/config.js", () => ({
  DEVTOOLS_ENABLED: true,
}));

vi.mock("../devtools/testReady.js", () => ({
  markBaryonTestControlsReady,
  resetBaryonTestReady,
}));

async function renderProvider(store) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const { ControlsProvider } = await import("./ControlsProvider.jsx");

  await act(async () => {
    root.render(
      React.createElement(
        ControlsProvider,
        {
          store,
        },
        React.createElement("div", null, "bridge"),
      ),
    );
  });

  return {
    container,
    root,
  };
}

describe("ControlsProvider bridges", () => {
  beforeEach(() => {
    window.localStorage.clear();
    markBaryonTestControlsReady.mockClear();
    resetBaryonTestReady.mockClear();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    delete window.__baryonControls;
    delete window.__baryonTestReady;
  });

  it("emits __baryon-controls-change when the store updates", async () => {
    const store = createControlsStore();
    const events = [];
    window.addEventListener("__baryon-controls-change", (event) => {
      events.push(event.detail);
    });

    const view = await renderProvider(store);

    await act(async () => {
      store.updateControl("backgroundColor", "#445566");
    });

    expect(events.at(-1)?.backgroundColor).toBe("#445566");

    await act(async () => {
      view.root.unmount();
    });
  });

  it("routes __baryon-controls-command into the store", async () => {
    const store = createControlsStore();
    const view = await renderProvider(store);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("__baryon-controls-command", {
          detail: {
            key: "backgroundColor",
            value: "#556677",
            persistMode: "immediate",
          },
        }),
      );
    });

    expect(store.getSnapshot().controlsState.backgroundColor).toBe("#556677");

    await act(async () => {
      view.root.unmount();
    });
  });

  it("publishes window.__baryonControls through the store and manages test-ready state", async () => {
    const store = createControlsStore();
    const view = await renderProvider(store);

    expect(window.__baryonControls?.getState?.().backgroundColor).toBe(
      store.getSnapshot().controlsState.backgroundColor,
    );
    expect(markBaryonTestControlsReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.__baryonControls.setControl("backgroundColor", "#667788");
    });

    expect(store.getSnapshot().controlsState.backgroundColor).toBe("#667788");

    await act(async () => {
      view.root.unmount();
    });

    expect(resetBaryonTestReady).toHaveBeenCalledTimes(1);
  });
});
