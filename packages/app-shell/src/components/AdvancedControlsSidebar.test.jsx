/* @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdvancedControlsSidebar from "./AdvancedControlsSidebar.jsx";

describe("AdvancedControlsSidebar info links", () => {
  let container = null;
  let root = null;
  let originalActEnvironment;
  let originalMatchMedia;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    originalMatchMedia = window.matchMedia;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    window.matchMedia = originalMatchMedia;
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function renderSidebar(overrides = {}) {
    act(() => {
      root.render(
        <AdvancedControlsSidebar
          folderGroups={[]}
          controlsState={{}}
          presets={[]}
          presetName=""
          selectedPresetName=""
          isOpen
          setPresetName={() => {}}
          updateControl={() => {}}
          resetControls={() => {}}
          savePreset={() => {}}
          loadPreset={() => {}}
          deletePreset={() => {}}
          onClose={() => {}}
          dockWidth="360px"
          {...overrides}
        />,
      );
    });
  }

  it("does not attach React wheel handlers inside the scroll panel", () => {
    const source = readFileSync(
      "src/components/AdvancedControlsSidebar.jsx",
      "utf8",
    );

    expect(source).not.toContain("onWheel=");
  });

  it("does not reposition help tooltips from capture-phase scroll listeners", () => {
    const source = readFileSync(
      "src/components/AdvancedControlsSidebar.jsx",
      "utf8",
    );

    expect(source).not.toContain('addEventListener("scroll"');
  });

  it("renders source, license, and social profile links", () => {
    renderSidebar();

    const links = Array.from(
      container.querySelectorAll(".baryon-controls-footer-links a"),
    );

    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      ["Source", "https://github.com/BaryonOfficial/Baryon"],
      [
        "License",
        "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
      ],
      ["X", "https://x.com/kyledcollins"],
      ["Instagram", "https://www.instagram.com/baryon.eth/"],
    ]);

    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      null,
      null,
      null,
      null,
    ]);

    expect(container.querySelector(".baryon-controls-footer img")).toBeNull();
  });

  it("does not offer deletion for a built-in visual preset", () => {
    const deletePreset = vi.fn();

    renderSidebar({
      presets: [
        {
          name: "Calibrated Clarity",
          builtIn: true,
          controls: {},
        },
      ],
      selectedPresetName: "Calibrated Clarity",
      deletePreset,
    });

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete selected",
    );

    expect(deleteButton?.disabled).toBe(true);
    deleteButton?.click();
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("does not let sidebar scrolling step focused numeric controls", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [
        {
          title: "Shape",
          expanded: true,
          controls: [
            {
              key: "densityGain",
              label: "Density",
              title: "Density",
              defaultValue: 3,
              binding: { min: 0.1, max: 4, step: 0.01 },
            },
          ],
        },
      ],
      controlsState: { densityGain: 2.85 },
      updateControl,
    });

    const input = container.querySelector(
      'input[aria-label="Density value"]',
    );
    expect(input).toBeInstanceOf(HTMLInputElement);
    input.focus();

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 320,
    });
    const dispatchResult = input.dispatchEvent(wheelEvent);

    expect(dispatchResult).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("2.85");
    expect(updateControl).not.toHaveBeenCalled();
  });

  it("marks sidebar pointer entry as UI interaction without scroll handlers", () => {
    const interactions = [];
    const handleInteraction = (event) => {
      interactions.push(event.detail);
    };
    window.addEventListener("__baryon-ui-interaction", handleInteraction);
    try {
      renderSidebar({
        folderGroups: [
          {
            title: "Shape",
            expanded: true,
            controls: [
              {
                key: "densityGain",
                label: "Density",
                title: "Density",
                defaultValue: 3,
                binding: { min: 0.1, max: 4, step: 0.01 },
              },
            ],
          },
        ],
        controlsState: { densityGain: 2.85 },
      });

      const scrollContainer = container.querySelector(
        ".baryon-controls-scroll",
      );
      expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
      scrollContainer.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
        }),
      );

      expect(interactions).toContainEqual({
        source: "advanced-controls",
        kind: "hover",
      });
    } finally {
      window.removeEventListener("__baryon-ui-interaction", handleInteraction);
    }
  });

  it("marks sidebar wheel scrolling as passive UI interaction", () => {
    const interactions = [];
    const handleInteraction = (event) => {
      interactions.push(event.detail);
    };
    window.addEventListener("__baryon-ui-interaction", handleInteraction);
    try {
      renderSidebar({
        folderGroups: [
          {
            title: "Shape",
            expanded: true,
            controls: [
              {
                key: "densityGain",
                label: "Density",
                title: "Density",
                defaultValue: 3,
                binding: { min: 0.1, max: 4, step: 0.01 },
              },
            ],
          },
        ],
        controlsState: { densityGain: 2.85 },
      });

      const scrollContainer = container.querySelector(
        ".baryon-controls-scroll",
      );
      expect(scrollContainer).toBeInstanceOf(HTMLDivElement);

      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 320,
      });
      const dispatchResult = scrollContainer.dispatchEvent(wheelEvent);

      expect(dispatchResult).toBe(true);
      expect(wheelEvent.defaultPrevented).toBe(false);
      expect(interactions).toContainEqual({
        source: "advanced-controls",
        kind: "scroll",
      });
    } finally {
      window.removeEventListener("__baryon-ui-interaction", handleInteraction);
    }
  });

  it("does not let sidebar scrolling step focused slider controls", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [
        {
          title: "Shape",
          expanded: true,
          controls: [
            {
              key: "densityGain",
              label: "Density",
              title: "Density",
              defaultValue: 3,
              binding: { min: 0.1, max: 4, step: 0.01 },
            },
          ],
        },
      ],
      controlsState: { densityGain: 2.85 },
      updateControl,
    });

    const slider = container.querySelector(
      'input[aria-label="Density slider"]',
    );
    expect(slider).toBeInstanceOf(HTMLInputElement);
    slider.focus();

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 320,
    });
    const dispatchResult = slider.dispatchEvent(wheelEvent);

    expect(dispatchResult).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(slider);
    expect(slider.value).toBe("2.85");
    expect(updateControl).not.toHaveBeenCalled();
  });

  it("does not let sidebar scrolling change a focused select control", () => {
    const loadPreset = vi.fn();
    renderSidebar({
      presets: [
        { name: "Calibrated Clarity", builtIn: true, controls: {} },
        { name: "Saved Haze", controls: {} },
      ],
      selectedPresetName: "Calibrated Clarity",
      loadPreset,
    });

    const select = container.querySelector('select[aria-label="Load preset"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    select.focus();

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 320,
    });
    const dispatchResult = select.dispatchEvent(wheelEvent);

    expect(dispatchResult).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(select);
    expect(select.value).toBe("Calibrated Clarity");
    expect(loadPreset).not.toHaveBeenCalled();
  });
});
