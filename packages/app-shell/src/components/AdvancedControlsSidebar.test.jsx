/* @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERFORMANCE_PROFILES } from "@baryon/engine/render/outputProfilePolicy";
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

  it("renders docs, source, license, and social profile links", () => {
    renderSidebar();

    const links = Array.from(
      container.querySelectorAll(".baryon-controls-footer-links a"),
    );

    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      ["Docs", "https://baryon.live/docs/"],
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
      null,
    ]);

    expect(container.querySelector(".baryon-controls-footer img")).toBeNull();
  });

  it("renders custom footer actions after the license link", () => {
    const onSelectTerms = vi.fn();
    renderSidebar({
      footerActions: [{ label: "Terms", onSelect: onSelectTerms }],
    });

    const footerItems = Array.from(
      container.querySelectorAll(
        ".baryon-controls-footer-links a, .baryon-controls-footer-links button",
      ),
    );

    expect(footerItems.map((item) => item.textContent)).toEqual([
      "Docs",
      "Source",
      "License",
      "Terms",
      "X",
      "Instagram",
    ]);

    footerItems[3].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectTerms).toHaveBeenCalledTimes(1);
  });

  it("gives the icon-only close button a specific accessible name", () => {
    renderSidebar();

    const closeButton = container.querySelector(
      ".baryon-controls-close-button",
    );

    expect(closeButton?.getAttribute("aria-label")).toBe(
      "Close advanced controls",
    );
    expect(closeButton?.getAttribute("title")).toBe("Close advanced controls");
  });

  it("renders the fullscreen UI opt-in directly below presets", () => {
    const onChange = vi.fn();
    renderSidebar({
      showUiInFullscreen: false,
      onShowUiInFullscreenChange: onChange,
    });

    const toggle = container.querySelector(
      '[data-testid="show-ui-in-fullscreen-toggle"]',
    );
    const input = toggle?.querySelector('input[type="checkbox"]');
    const presets = container.querySelector(".baryon-controls-presets");

    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toContain("Show UI in fullscreen");
    expect(toggle?.textContent).toContain("Press F to enter/exit fullscreen.");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.getAttribute("aria-label")).toBe("Show UI in fullscreen");
    expect(input?.checked).toBe(false);
    expect(presets?.nextElementSibling).toBe(toggle);

    act(() => {
      input?.click();
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not offer deletion when no user preset is selected", () => {
    const deletePreset = vi.fn();

    renderSidebar({
      presets: [],
      selectedPresetName: "",
      deletePreset,
    });

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete selected",
    );

    expect(deleteButton?.disabled).toBe(true);
    deleteButton?.click();
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("renders only the placeholder option when there are no user presets", () => {
    renderSidebar({ presets: [] });

    const select = container.querySelector('select[aria-label="Load preset"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "",
    ]);
  });

  it("pins performance and output controls outside collapsible groups", () => {
    const updateControl = vi.fn();

    renderSidebar({
      folderGroups: [
        {
          title: "Performance",
          expanded: true,
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
        {
          title: "Output",
          expanded: true,
          controls: [
            {
              key: "outputMode",
              label: "Output Mode",
              title: "Output Mode",
              defaultValue: "transparent",
              binding: {
                view: "segmented",
                options: {
                  Transparent: "transparent",
                  Opaque: "opaque",
                },
              },
            },
          ],
        },
      ],
      controlsState: {
        renderQualityPreset: PERFORMANCE_PROFILES.auto,
        performanceHudEnabled: false,
        outputMode: "transparent",
      },
      updateControl,
    });

    expect(container.querySelector('select[aria-label="Profile"]')).toBeNull();
    expect(
      container.querySelector('select[aria-label="Output Mode"]'),
    ).toBeNull();

    const groups = Array.from(
      container.querySelectorAll(".baryon-controls-segmented"),
    );
    expect(groups).toHaveLength(2);
    expect(
      Array.from(container.querySelectorAll('[role="radio"]')).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Auto", "Custom", "Max", "Transparent", "Opaque"]);

    expect(
      Array.from(container.querySelectorAll(".baryon-controls-pinned-section"))
        .map((section) =>
          section
            .querySelector(".baryon-controls-section-label")
            ?.textContent?.trim(),
        )
        .filter(Boolean),
    ).toEqual(["Performance"]);

    const performanceSection = Array.from(
      container.querySelectorAll(".baryon-controls-pinned-section"),
    ).find((section) =>
      section
        .querySelector(".baryon-controls-section-label")
        ?.textContent?.includes("Performance"),
    );
    const performanceHeader = performanceSection?.querySelector(
      ".baryon-controls-pinned-header",
    );
    const hudToggle = performanceHeader?.querySelector(
      'input[aria-label="HUD"]',
    );
    const profileCard = Array.from(
      performanceSection?.querySelectorAll(".baryon-controls-card") ?? [],
    ).find((card) => card.textContent?.includes("Profile"));
    expect(performanceHeader?.textContent).toContain("Performance");
    expect(performanceHeader?.textContent).toContain("HUD");
    expect(hudToggle).toBeInstanceOf(HTMLInputElement);
    expect(
      performanceHeader?.compareDocumentPosition(profileCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    hudToggle?.click();
    expect(updateControl).toHaveBeenCalledWith("performanceHudEnabled", true);

    const outputModeLabel = Array.from(
      container.querySelectorAll(".baryon-controls-card-label"),
    ).find((label) => label.textContent === "Output Mode");
    const outputModeCard = outputModeLabel?.closest(".baryon-controls-card");
    expect(outputModeLabel?.classList).toContain(
      "baryon-controls-segmented-label",
    );
    expect(outputModeCard?.children[0]).toContain(outputModeLabel);
    expect(
      outputModeCard?.children[1]?.classList.contains(
        "baryon-controls-segmented",
      ),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll(".baryon-controls-group-toggle"))
        .map((button) => button.textContent)
        .some(
          (text) => text.includes("Performance") || text.includes("Output"),
        ),
    ).toBe(false);

    const opaqueButton = Array.from(
      container.querySelectorAll('[role="radio"]'),
    ).find((button) => button.textContent === "Opaque");
    opaqueButton?.click();

    expect(updateControl).toHaveBeenCalledWith("outputMode", "opaque");
  });

  it("adds extra separation between preset name and load controls", () => {
    renderSidebar();

    const loadField = container.querySelector(
      ".baryon-controls-presets-load-field",
    );

    expect(loadField).not.toBeNull();
    expect(window.getComputedStyle(loadField).marginTop).toBe("0.22rem");
  });

  it("does not let sidebar scrolling step focused numeric controls", () => {
    const updateControl = vi.fn();
    renderSidebar({
      folderGroups: [
        {
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
        },
      ],
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
        folderGroups: [
          {
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

  it("coalesces bursty sidebar wheel interaction markers", () => {
    const interactions = [];
    const handleInteraction = (event) => {
      interactions.push(event.detail);
    };
    window.addEventListener("__baryon-ui-interaction", handleInteraction);
    try {
      renderSidebar({
        folderGroups: [
          {
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
          },
        ],
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
      folderGroups: [
        {
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
      presets: [{ name: "Saved Haze", controls: {} }],
      selectedPresetName: "Saved Haze",
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
    expect(select.value).toBe("Saved Haze");
    expect(loadPreset).not.toHaveBeenCalled();
  });
});
