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

  test("keeps desktop root chrome on the shared void token", () => {
    const css = readWorkspaceFile("apps/desktop/src/index.css");

    expect(css).toContain("background: var(--baryon-void);");
    expect(css).not.toContain("#0a0b0f");
  });
});
