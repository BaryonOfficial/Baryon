/* @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERFORMANCE_PROFILES } from "@baryon/engine/render/outputProfilePolicy";
import AdvancedControlsSidebar from "./AdvancedControlsSidebar.jsx";

const VOLUME_GROUP = {
  title: "Volume",
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
};

describe("AdvancedControlsSidebar", () => {
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
          dockWidth="312px"
          {...overrides}
        />,
      );
    });
  }

  function setFilterQuery(query) {
    const input = container.querySelector(
      'input[aria-label="Filter controls"]',
    );
    expect(input).toBeInstanceOf(HTMLInputElement);
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setValue.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
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

  it("renders a compact unbranded header with an accessible close button", () => {
    renderSidebar();

    const header = container.querySelector(".baryon-controls-header");
    const closeButton = container.querySelector(
      ".baryon-controls-close-button",
    );

    expect(header?.textContent).toContain("Settings");
    expect(window.getComputedStyle(header).display).toBe("grid");
    expect(header?.querySelector(".baryon-controls-header-logo")).toBeNull();
    expect(closeButton?.getAttribute("aria-label")).toBe("Close settings");
    expect(closeButton?.getAttribute("title")).toBe("Close settings");
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });

  it("renders a labeled bug-report button and quiet resource links", () => {
    renderSidebar();

    const bugLink = Array.from(
      container.querySelectorAll("a.baryon-controls-footer-button"),
    ).find((link) => link.textContent?.includes("Feedback"));
    expect(bugLink).toBeInstanceOf(HTMLAnchorElement);
    expect(bugLink.href).toBe(
      "https://github.com/BaryonOfficial/Baryon/issues",
    );
    expect(bugLink.getAttribute("target")).toBe("_blank");
    expect(bugLink.querySelector("svg")).not.toBeNull();

    const textLinks = Array.from(
      container.querySelectorAll("a.baryon-controls-footer-text-link"),
    );
    expect(textLinks.map((link) => [link.textContent, link.href])).toEqual([
      ["Docs", "https://baryon.live/docs/"],
      ["Source", "https://github.com/BaryonOfficial/Baryon"],
      [
        "License",
        "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
      ],
    ]);

    const socialLinks = Array.from(
      container.querySelectorAll(".baryon-controls-footer-social a"),
    );
    expect(
      socialLinks.map((link) => [link.getAttribute("aria-label"), link.href]),
    ).toEqual([
      ["X", "https://x.com/kyledcollins"],
      ["Instagram", "https://www.instagram.com/baryon.eth/"],
    ]);
    expect(socialLinks.map((link) => link.getAttribute("data-brand"))).toEqual([
      "x",
      "instagram",
    ]);
  });

  it("opens in-app feedback instead of linking out when a handler is provided", () => {
    const onOpenFeedback = vi.fn();
    renderSidebar({ onOpenFeedback });

    expect(
      container.querySelector("a.baryon-controls-footer-button"),
    ).toBeNull();
    const feedbackButton = Array.from(
      container.querySelectorAll("button.baryon-controls-footer-button"),
    ).find((button) => button.textContent?.includes("Feedback"));
    expect(feedbackButton).toBeInstanceOf(HTMLButtonElement);
    expect(feedbackButton.querySelector("svg")).not.toBeNull();

    act(() => {
      feedbackButton.click();
    });
    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
  });

  it("renders custom footer actions as text buttons", () => {
    const onSelectTerms = vi.fn();
    renderSidebar({
      footerActions: [{ label: "Terms", onSelect: onSelectTerms }],
    });

    const termsButton = Array.from(
      container.querySelectorAll("button.baryon-controls-footer-text-link"),
    ).find((button) => button.textContent === "Terms");

    expect(termsButton).toBeInstanceOf(HTMLButtonElement);
    termsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectTerms).toHaveBeenCalledTimes(1);
  });

  it("seats a host footer accessory between the buttons and the resource links", () => {
    renderSidebar({
      footerAccessory: <div data-testid="host-footer-accessory" />,
    });

    const accessory = container.querySelector(
      '[data-testid="host-footer-accessory"]',
    );
    expect(accessory).not.toBeNull();
    expect(accessory.previousElementSibling.className).toBe(
      "baryon-controls-footer-buttons",
    );
    expect(accessory.nextElementSibling.className).toBe(
      "baryon-controls-footer-meta",
    );
  });

  it("omits the footer accessory when the host supplies none", () => {
    renderSidebar();

    const footer = container.querySelector(".baryon-controls-footer");
    expect(footer.children).toHaveLength(2);
  });

  it("resets controls from the footer action", () => {
    const resetControls = vi.fn();
    renderSidebar({ resetControls });

    const resetButton = Array.from(
      container.querySelectorAll("button.baryon-controls-footer-button"),
    ).find((button) => button.textContent === "Reset all");

    expect(resetButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      resetButton.click();
    });
    expect(resetControls).toHaveBeenCalledTimes(1);
  });

  it("groups the fullscreen UI preference with Output", () => {
    const onChange = vi.fn();
    renderSidebar({
      folderGroups: [
        { title: "Logo", expanded: false, controls: [] },
        {
          title: "Output",
          expanded: false,
          controls: [
            {
              key: "outputBackgroundColor",
              label: "Output Color",
              title: "Output Color",
              defaultValue: "#000000",
              binding: { view: "color" },
            },
          ],
        },
        { title: "Diagnostics", expanded: false, controls: [] },
      ],
      showUiInFullscreen: false,
      onShowUiInFullscreenChange: onChange,
    });

    const groups = Array.from(
      container.querySelectorAll(".baryon-controls-group"),
    );
    expect(
      groups.map(
        (group) =>
          group.querySelector(".baryon-controls-group-title")?.textContent,
      ),
    ).toEqual(["Logo", "Output", "Diagnostics"]);

    const outputGroup = groups[1];
    const groupToggle = outputGroup?.querySelector(
      ".baryon-controls-group-toggle",
    );
    expect(groupToggle?.textContent).toContain("2");
    expect(
      outputGroup?.querySelector('input[aria-label="Fullscreen UI"]'),
    ).toBeNull();

    act(() => {
      groupToggle?.click();
    });

    expect(
      outputGroup?.querySelector('input[aria-label="Output Color"]'),
    ).toBeInstanceOf(HTMLInputElement);
    const input = outputGroup?.querySelector(
      'input[aria-label="Fullscreen UI"]',
    );

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.checked).toBe(false);

    act(() => {
      input?.click();
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("finds the fullscreen UI preference through control filtering", () => {
    renderSidebar({
      folderGroups: [{ ...VOLUME_GROUP, expanded: false }],
      showUiInFullscreen: false,
      onShowUiInFullscreenChange: vi.fn(),
    });

    setFilterQuery("fullscreen");

    expect(container.textContent).toContain("Fullscreen");
    expect(
      container.querySelector('input[aria-label="Fullscreen UI"]'),
    ).toBeInstanceOf(HTMLInputElement);
    expect(container.textContent).not.toContain("No controls match");
    expect(container.textContent).not.toContain("Volume");
  });

  it("loads a preset from the preset select", () => {
    const loadPreset = vi.fn();
    renderSidebar({
      presets: [
        { name: "Night Bloom", controls: {} },
        { name: "Ember Field", controls: {} },
      ],
      loadPreset,
    });

    const select = container.querySelector(
      'select[aria-label="Saved presets"]',
    );
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["Live — unsaved", "Night Bloom", "Ember Field"]);

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      ).set;
      setValue.call(select, "Ember Field");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(loadPreset).toHaveBeenCalledWith("Ember Field");
  });

  it("shows an empty placeholder when there are no saved presets", () => {
    renderSidebar({ presets: [] });

    const emptyState = container.querySelector(
      '[aria-label="No saved presets"]',
    );
    expect(emptyState?.textContent).toContain("No presets yet");
    expect(emptyState?.textContent).toContain(
      "Name this setup below to keep it for later.",
    );
    expect(
      container.querySelector('select[aria-label="Saved presets"]'),
    ).toBeNull();
    expect(container.textContent).toContain("0 saved");
  });

  it("saves a named preset and identifies replacement", () => {
    const savePreset = vi.fn();
    renderSidebar({ presetName: "Night Bloom", savePreset });

    const saveButton = container.querySelector('button[type="submit"]');
    expect(saveButton?.textContent).toBe("Save");
    expect(saveButton?.disabled).toBe(false);

    act(() => {
      saveButton?.click();
    });
    expect(savePreset).toHaveBeenCalledTimes(1);

    renderSidebar({
      presetName: "Night Bloom",
      presets: [{ name: "Night Bloom", controls: {} }],
    });
    const replaceButton = container.querySelector('button[type="submit"]');
    expect(replaceButton?.textContent).toBe("Replace");
    expect(replaceButton?.getAttribute("aria-label")).toBe(
      "Replace Night Bloom",
    );
  });

  it("disables the save button without a preset name", () => {
    renderSidebar({ presetName: "   " });

    const saveButton = container.querySelector('button[type="submit"]');
    expect(saveButton?.disabled).toBe(true);
  });

  it("does not offer deletion when no user preset is selected", () => {
    const deletePreset = vi.fn();
    renderSidebar({
      presets: [],
      selectedPresetName: "",
      deletePreset,
    });

    const deleteButton = container.querySelector(
      '.baryon-controls-icon-button[data-variant="danger"]',
    );

    expect(deleteButton).toBeNull();
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("confirms deletion on the same button before removing a preset", () => {
    const deletePreset = vi.fn();
    renderSidebar({
      presets: [{ name: "Night Bloom", controls: {} }],
      selectedPresetName: "Night Bloom",
      deletePreset,
    });

    const deleteButton = container.querySelector(
      '.baryon-controls-icon-button[data-variant="danger"]',
    );
    expect(deleteButton?.getAttribute("aria-label")).toBe("Delete Night Bloom");

    act(() => {
      deleteButton.click();
    });
    expect(deletePreset).not.toHaveBeenCalled();

    const confirmButton = container.querySelector(
      '.baryon-controls-icon-button[data-variant="danger-confirm"]',
    );
    expect(confirmButton?.getAttribute("aria-label")).toBe(
      "Confirm delete Night Bloom",
    );

    act(() => {
      confirmButton.click();
    });
    expect(deletePreset).toHaveBeenCalledWith("Night Bloom");
  });

  it("collapses groups by default and expands them on toggle", () => {
    const multiControlVolumeGroup = {
      ...VOLUME_GROUP,
      expanded: false,
      controls: [
        ...VOLUME_GROUP.controls,
        {
          key: "surfaceBias",
          label: "Surface Bias",
          title: "Surface Bias",
          defaultValue: 0,
          binding: { min: -1, max: 1, step: 0.01 },
        },
      ],
    };
    renderSidebar({
      folderGroups: [multiControlVolumeGroup],
      controlsState: { densityGain: 2.85, surfaceBias: 0 },
    });

    expect(
      container.querySelector('input[aria-label="Density value"]'),
    ).toBeNull();

    const groupToggle = container.querySelector(
      ".baryon-controls-group-toggle",
    );
    expect(groupToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(groupToggle?.textContent).toContain("Volume");
    expect(groupToggle?.textContent).toContain("2");

    act(() => {
      groupToggle.click();
    });

    expect(groupToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelector('input[aria-label="Density value"]'),
    ).toBeInstanceOf(HTMLInputElement);
  });

  it("keeps section-header controls interactive while the group is collapsed", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [
        {
          title: "Performance",
          expanded: false,
          controls: [
            {
              key: "renderQualityPreset",
              label: "Profile",
              title: "Profile",
              defaultValue: PERFORMANCE_PROFILES.auto,
              binding: {
                view: "segmented",
                options: {
                  Auto: PERFORMANCE_PROFILES.auto,
                  Custom: PERFORMANCE_PROFILES.custom,
                  Max: PERFORMANCE_PROFILES.maxQuality,
                },
              },
            },
            {
              key: "performanceHudEnabled",
              label: "HUD",
              title: "Shows FPS and render resolution on screen",
              defaultValue: false,
              pinnedPlacement: "section-header",
            },
          ],
        },
      ],
      controlsState: {
        renderQualityPreset: PERFORMANCE_PROFILES.auto,
        performanceHudEnabled: false,
      },
      updateControl,
    });

    const header = container.querySelector(".baryon-controls-group-header");
    const hudToggle = header?.querySelector('input[aria-label="HUD"]');
    expect(hudToggle).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);

    hudToggle?.click();
    expect(updateControl).toHaveBeenCalledWith("performanceHudEnabled", true);

    const groupToggle = container.querySelector(
      ".baryon-controls-group-toggle",
    );
    act(() => {
      groupToggle.click();
    });

    expect(
      Array.from(container.querySelectorAll('[role="radio"]')).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Auto", "Custom", "Max"]);
    expect(
      container.querySelectorAll(".baryon-controls-segmented"),
    ).toHaveLength(1);
  });

  it("shows applied diagnostic state beside the requested control", () => {
    renderSidebar({
      folderGroups: [
        {
          title: "Diagnostics",
          expanded: true,
          controls: [
            {
              key: "injectTestTone",
              label: "Inject Tone",
              title: "Inject a test tone",
              defaultValue: false,
            },
          ],
        },
      ],
      controlsState: { injectTestTone: true },
      controlStatuses: {
        injectTestTone: {
          state: "applying",
          label: "Applying",
        },
      },
    });

    const status = container.querySelector(
      '[data-testid="advanced-controls-status-injectTestTone"]',
    );
    expect(status?.textContent).toBe("Applying");
    expect(status?.getAttribute("data-state")).toBe("applying");
    expect(status?.getAttribute("aria-label")).toBe("Inject Tone: Applying");
  });

  it("filters controls across collapsed groups", () => {
    renderSidebar({
      folderGroups: [
        { ...VOLUME_GROUP, expanded: false },
        {
          title: "Appearance",
          expanded: false,
          controls: [
            {
              key: "colorMode",
              label: "Color Mode",
              title: "Color Mode",
              defaultValue: "static",
              binding: {
                options: { Static: "static", Spectral: "spectral" },
              },
            },
          ],
        },
      ],
      controlsState: { densityGain: 2.85, colorMode: "static" },
      presets: [{ name: "Night Bloom", controls: {} }],
    });

    setFilterQuery("color");

    expect(
      container.querySelector('select[aria-label="Color Mode"]'),
    ).toBeInstanceOf(HTMLSelectElement);
    expect(
      container.querySelector('input[aria-label="Density value"]'),
    ).toBeNull();
    expect(
      container.querySelector('select[aria-label="Saved presets"]'),
    ).toBeNull();

    const clearButton = container.querySelector('[aria-label="Clear filter"]');
    act(() => {
      clearButton.click();
    });

    expect(container.textContent).toContain("Volume");
    expect(
      container.querySelector('input[aria-label="Density value"]'),
    ).toBeNull();
    expect(
      container.querySelector('select[aria-label="Saved presets"]'),
    ).toBeInstanceOf(HTMLSelectElement);
  });

  it("shows an empty state when no controls match the filter", () => {
    renderSidebar({
      folderGroups: [{ ...VOLUME_GROUP, expanded: false }],
      controlsState: { densityGain: 2.85 },
    });

    setFilterQuery("zzzz");

    expect(container.textContent).toContain("No controls match");
  });

  it("does not let sidebar scrolling step focused numeric controls", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [VOLUME_GROUP],
      controlsState: { densityGain: 2.85 },
      updateControl,
    });

    const input = container.querySelector('input[aria-label="Density value"]');
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
        folderGroups: [VOLUME_GROUP],
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
        folderGroups: [VOLUME_GROUP],
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

  it("coalesces bursty sidebar wheel interaction markers", () => {
    const interactions = [];
    const handleInteraction = (event) => {
      interactions.push(event.detail);
    };
    window.addEventListener("__baryon-ui-interaction", handleInteraction);
    try {
      renderSidebar({
        folderGroups: [VOLUME_GROUP],
        controlsState: { densityGain: 2.85 },
      });

      const scrollContainer = container.querySelector(
        ".baryon-controls-scroll",
      );
      expect(scrollContainer).toBeInstanceOf(HTMLDivElement);

      for (const deltaY of [320, -320, 320]) {
        scrollContainer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY,
          }),
        );
      }

      expect(
        interactions.filter((detail) => detail.kind === "scroll"),
      ).toHaveLength(1);
    } finally {
      window.removeEventListener("__baryon-ui-interaction", handleInteraction);
    }
  });

  it("does not let sidebar scrolling step focused slider controls", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [VOLUME_GROUP],
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
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [
        {
          title: "Appearance",
          expanded: true,
          controls: [
            {
              key: "colorMode",
              label: "Color Mode",
              title: "Color Mode",
              defaultValue: "static",
              binding: {
                options: { Static: "static", Spectral: "spectral" },
              },
            },
          ],
        },
      ],
      controlsState: { colorMode: "static" },
      updateControl,
    });

    const select = container.querySelector('select[aria-label="Color Mode"]');
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
    expect(select.value).toBe("static");
    expect(updateControl).not.toHaveBeenCalled();
  });
});
