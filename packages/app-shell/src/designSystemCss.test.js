import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../..");

function readWorkspaceFile(path) {
  return readFileSync(join(workspaceRoot, path), "utf8");
}

async function expectWorkspaceFile(path) {
  await expect(access(join(workspaceRoot, path))).resolves.toBeUndefined();
}

describe("Bebop XR design-system CSS", () => {
  test("anchors the shared shell to the Baryon brand tokens", () => {
    const css = readWorkspaceFile("packages/app-shell/src/index.css");

    expect(css.toLowerCase()).toContain("--baryon-void: #0d0a07;");
    expect(css.toLowerCase()).toContain("--baryon-amber: #f2a05c;");
    expect(css.toLowerCase()).toContain("--baryon-cream: #e8dfd0;");
    expect(css.toLowerCase()).toContain("--baryon-resonance: #5be3f4;");
    expect(css).toContain("--nd-black: var(--baryon-void);");
    expect(css).toContain("--nd-accent: var(--baryon-amber);");
    expect(css).toContain('font-family: "Aspekta"');
    expect(css).toContain('font-family: "JetBrains Mono"');
    expect(css).toContain(
      '--baryon-type-interface-family: "Aspekta", system-ui, sans-serif;',
    );
    expect(css).toMatch(
      /--baryon-type-mono-family:\s*"JetBrains Mono", ui-monospace/,
    );
    expect(css).toMatch(/--baryon-type-display-family:\s*"Orbitron"/);
    expect(css).toContain("--baryon-type-heading-letter-spacing: 0.16em;");
    expect(css).toContain("--baryon-type-action-letter-spacing: 0.08em;");
    expect(css).toContain("--baryon-type-data-letter-spacing: 0.04em;");
    expect(css).toContain("--baryon-audio-pill-radius: 999px;");
    expect(css).toContain("--baryon-audio-pill-min-height: 2.85rem;");
    expect(css).toContain(
      "--baryon-audio-pill-padding-inline-start: 1.125rem;",
    );
    expect(css).toContain("--baryon-audio-pill-padding-inline-end: 1.125rem;");
    expect(css).toContain("--baryon-audio-pill-padding:");
    expect(css).toContain("--baryon-source-selector-radius: 999px;");
    expect(css).toContain("--baryon-source-selector-min-height: 2.3rem;");
    expect(css).toContain("--baryon-source-selector-padding:");
  });

  test("routes visible app-shell text through Baryon typography tokens", () => {
    const componentPaths = [
      "packages/app-shell/src/components/AdvancedControlsDock.jsx",
      "packages/app-shell/src/components/AdvancedControlsSidebar.jsx",
      "packages/app-shell/src/components/AudioControls.jsx",
      "packages/app-shell/src/components/FloatingCameraControls.jsx",
      "packages/app-shell/src/components/LiveInputStatusPanel.jsx",
      "packages/app-shell/src/components/OutputStageSurface.jsx",
      "packages/app-shell/src/components/PerformanceHud.jsx",
      "packages/app-shell/src/components/ThreeScene.jsx",
      "packages/app-shell/src/components/UnsupportedWarning.jsx",
      "packages/app-shell/src/components/controls/SourceSelector.jsx",
      "apps/desktop/src/components/DesktopModeToggle.jsx",
      "apps/desktop/src/components/OperatorShell.jsx",
      "apps/desktop/src/components/PerformerControls.jsx",
      "packages/visualizer/src/styles.css",
    ];

    for (const path of componentPaths) {
      const source = readWorkspaceFile(path);

      expect(source).not.toMatch(/fontFamily:\s*["'][^"']*Aspekta/);
      expect(source).not.toMatch(/fontFamily:\s*["'][^"']*JetBrains Mono/);
      expect(source).not.toMatch(/fontFamily:\s*["'][^"']*Orbitron/);
      expect(source).not.toMatch(/fontFamily:\s*["'][^"']*monospace/);
      expect(source).not.toMatch(/font-family:\s*"Aspekta"/);
      expect(source).not.toMatch(/font-family:\s*"JetBrains Mono"/);
      expect(source).not.toMatch(/font-family:\s*Ubuntu/);
      expect(source).not.toMatch(/letterSpacing:\s*["']0\./);
      expect(source).not.toMatch(/letter-spacing:\s*0\./);
    }
  });

  test("serves the design-system font files from both product apps", async () => {
    await Promise.all([
      expectWorkspaceFile("apps/web/public/fonts/Aspekta/AspektaVF.ttf"),
      expectWorkspaceFile(
        "apps/web/public/fonts/JetBrainsMono/JetBrainsMono-Regular.woff2",
      ),
      expectWorkspaceFile("apps/desktop/public/fonts/Aspekta/AspektaVF.ttf"),
      expectWorkspaceFile(
        "apps/desktop/public/fonts/JetBrainsMono/JetBrainsMono-Regular.woff2",
      ),
    ]);
  });

  test("keeps desktop root chrome on the shared black token", () => {
    const css = readWorkspaceFile("apps/desktop/src/index.css");

    expect(css).toContain("background: var(--nd-black);");
    expect(css).not.toContain("#0a0b0f");
  });
});
