/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./AdvancedControlsSidebar.jsx", () => ({
  default: ({ isOpen, footerActions = [] }) =>
    isOpen ? (
      <div data-testid="advanced-controls-sidebar">
        Sidebar
        {footerActions.map((action) => (
          <button key={action.label} type="button" onClick={action.onSelect}>
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
}));

import { ControlsProvider } from "../controls/ControlsProvider.jsx";
import { createControlsStore } from "../controls/controlsStore.js";
import AdvancedControlsDock from "./AdvancedControlsDock.jsx";

describe("AdvancedControlsDock", () => {
  let container = null;
  let root = null;
  let store = null;
  let originalActEnvironment;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store = createControlsStore();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    store?.dispose();
    root = null;
    store = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function renderDock(props = {}) {
    act(() => {
      root.render(
        <ControlsProvider store={store}>
          <AdvancedControlsDock {...props} />
        </ControlsProvider>,
      );
    });
  }

  it("opens the sidebar from the trigger and reports the open state", () => {
    const onOpenChange = vi.fn();

    renderDock({ onOpenChange });

    const trigger = container.querySelector(
      '[data-testid="advanced-controls-trigger"]',
    );

    expect(trigger).not.toBeNull();
    expect(
      container.querySelector('[data-testid="advanced-controls-sidebar"]'),
    ).toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector('[data-testid="advanced-controls-sidebar"]'),
    ).not.toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders a closed-state accessory without a brand label", () => {
    renderDock({
      brandAccessory: (
        <button data-testid="brand-accessory" type="button">
          Version
        </button>
      ),
    });

    expect(container.textContent).not.toContain("Baryon");
    expect(container.querySelector('[data-testid="brand-accessory"]')).not.toBe(
      null,
    );
  });

  it("forwards footer actions to the sidebar", () => {
    const onSelectTerms = vi.fn();

    renderDock({
      footerActions: [{ label: "Terms", onSelect: onSelectTerms }],
    });

    const trigger = container.querySelector(
      '[data-testid="advanced-controls-trigger"]',
    );

    act(() => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const termsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Terms",
    );
    expect(termsButton).not.toBeNull();

    act(() => {
      termsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelectTerms).toHaveBeenCalledTimes(1);
  });
});
