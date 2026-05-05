/* @vitest-environment jsdom */

import React from "react";
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

  function renderSidebar() {
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
        />,
      );
    });
  }

  it("renders source, license, and social profile links", () => {
    renderSidebar();

    const links = Array.from(
      container.querySelectorAll(".baryon-controls-footer-links a"),
    );

    expect(
      links.map((link) => [link.textContent?.replace("↗", ""), link.href]),
    ).toEqual([
      ["Source", "https://github.com/BaryonOfficial/Baryon"],
      [
        "License",
        "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
      ],
      ["X", "https://x.com/kyledcollins"],
      ["Instagram", "https://www.instagram.com/baryon.eth/"],
    ]);

    const socialIconLabels = links
      .map((link) =>
        link.querySelector("img")?.getAttribute("data-social-icon"),
      )
      .filter(Boolean);

    expect(socialIconLabels).toEqual(["X", "Instagram"]);

    const styleText = container.querySelector("style")?.textContent ?? "";

    expect(styleText).toContain("width: 0.82rem;");
    expect(styleText).toContain("height: 0.82rem;");
  });
});
