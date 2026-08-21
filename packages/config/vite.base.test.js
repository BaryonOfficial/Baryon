import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createBaryonRuntimeHmrPlugin,
  createBaryonWorkspaceAliases,
  shouldForceBaryonRuntimeReload,
} from "./vite.base.js";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const workspacePackages = [
  {
    directory: "packages/app-shell",
    manifest: JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "packages/app-shell/package.json"),
        "utf8",
      ),
    ),
  },
  {
    directory: "packages/engine",
    manifest: JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "packages/engine/package.json"),
        "utf8",
      ),
    ),
  },
];
const workspaceAliases = createBaryonWorkspaceAliases({ workspaceRoot });

function resolveWorkspaceAlias(specifier) {
  const alias = workspaceAliases.find(({ find }) =>
    typeof find === "string" ? find === specifier : find.test(specifier),
  );
  return alias?.replacement ?? null;
}

describe("Baryon workspace aliases", () => {
  it("derives every public workspace subpath from its package exports", () => {
    const expectedAliasCount = workspacePackages.reduce(
      (count, { manifest }) => count + Object.keys(manifest.exports).length,
      0,
    );
    expect(workspaceAliases).toHaveLength(expectedAliasCount);

    for (const { directory, manifest } of workspacePackages) {
      for (const [subpath, target] of Object.entries(manifest.exports)) {
        const specifier =
          subpath === "."
            ? manifest.name
            : `${manifest.name}${subpath.slice(1)}`;
        expect(resolveWorkspaceAlias(specifier), specifier).toBe(
          path.resolve(workspaceRoot, directory, target),
        );
      }
    }
  });
});

describe("Baryon runtime HMR policy", () => {
  it("classifies engine and renderer owners for full reload", () => {
    expect(
      shouldForceBaryonRuntimeReload(
        path.join(
          workspaceRoot,
          "packages/engine/src/render/outputPipeline.js",
        ),
        { workspaceRoot },
      ),
    ).toBe(true);
    expect(
      shouldForceBaryonRuntimeReload(
        path.join(
          workspaceRoot,
          "packages/app-shell/src/components/hooks/useBaryonEngine.js",
        ),
        { workspaceRoot },
      ),
    ).toBe(true);
    expect(
      shouldForceBaryonRuntimeReload(
        path.join(
          workspaceRoot,
          "packages/app-shell/src/components/AdvancedControlsSidebar.jsx",
        ),
        { workspaceRoot },
      ),
    ).toBe(false);
  });

  it("sends exactly one client full reload and consumes the normal HMR update", () => {
    const plugin = createBaryonRuntimeHmrPlugin({ workspaceRoot });
    const invalidateModule = vi.fn();
    const send = vi.fn();
    const module = { id: "engine" };
    const result = plugin.hotUpdate.call(
      {
        environment: {
          name: "client",
          moduleGraph: { invalidateModule },
          hot: { send },
        },
      },
      {
        file: path.join(
          workspaceRoot,
          "packages/engine/src/utils/audio/audioFeatureEngine.worker.js",
        ),
        modules: [module],
        timestamp: 42,
      },
    );

    expect(result).toEqual([]);
    expect(invalidateModule).toHaveBeenCalledTimes(1);
    expect(invalidateModule).toHaveBeenCalledWith(
      module,
      expect.any(Set),
      42,
      true,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "full-reload" });
  });

  it("leaves UI modules on normal Fast Refresh", () => {
    const plugin = createBaryonRuntimeHmrPlugin({ workspaceRoot });
    const send = vi.fn();
    const result = plugin.hotUpdate.call(
      {
        environment: {
          name: "client",
          moduleGraph: { invalidateModule: vi.fn() },
          hot: { send },
        },
      },
      {
        file: path.join(
          workspaceRoot,
          "packages/app-shell/src/components/AdvancedControlsSidebar.jsx",
        ),
        modules: [],
        timestamp: 43,
      },
    );

    expect(result).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
