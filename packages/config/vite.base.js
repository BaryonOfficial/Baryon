import path from "node:path";
import { transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";
import appShellManifest from "../app-shell/package.json" with { type: "json" };
import engineManifest from "../engine/package.json" with { type: "json" };

const BARYON_RENDERER_WORKSPACE_PACKAGES = Object.freeze([
  Object.freeze({
    directory: "packages/app-shell",
    manifest: appShellManifest,
  }),
  Object.freeze({
    directory: "packages/engine",
    manifest: engineManifest,
  }),
]);

export const baryonCommonViteDedupe = [
  "react",
  "react-dom",
  "three",
  "@react-three/fiber",
  "scheduler",
  "zustand",
];

export const baryonCommonOptimizeDepsInclude = [
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@react-three/drei",
  "@react-three/fiber",
  "scheduler",
  "stats.js",
  "three",
  "three/examples/jsm/loaders/DRACOLoader.js",
  "three/examples/jsm/loaders/GLTFLoader.js",
  "three/examples/jsm/tsl/display/BloomNode.js",
  "three/examples/jsm/tsl/display/SMAANode.js",
  "three/examples/jsm/tsl/display/TRAANode.js",
  "three/tsl",
  "three/webgpu",
  "use-sync-external-store/shim/with-selector",
  "zustand",
  "zustand/react",
  "zustand/vanilla",
  "zustand/traditional",
  "zustand/middleware",
  "zustand/shallow",
];

const BARYON_RUNTIME_HMR_PATH_PREFIXES = Object.freeze([
  "packages/engine/src/",
  "packages/app-shell/src/components/BaryonScene.",
  "packages/app-shell/src/components/OutputStageSurface.",
  "packages/app-shell/src/components/ThreeScene.",
  "packages/app-shell/src/components/rendererDiagnostics.",
  "packages/app-shell/src/components/hooks/baryonEngine",
  "packages/app-shell/src/components/hooks/raymarchAuditFixtureRuntimeAdapter.",
  "packages/app-shell/src/components/hooks/runtimeSessionController.",
  "packages/app-shell/src/components/hooks/useBaryonEngine.",
  "packages/app-shell/src/components/hooks/useBaryonPipeline.",
  "packages/app-shell/src/components/hooks/useRuntimeSessionController.",
  "packages/app-shell/src/components/hooks/useVisualizationRuntimeLifecycle.",
]);

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

export function shouldForceBaryonRuntimeReload(file, { workspaceRoot }) {
  const relativePath = normalizeRelativePath(
    path.relative(workspaceRoot, file),
  );
  if (relativePath === ".." || relativePath.startsWith("../")) {
    return false;
  }
  return BARYON_RUNTIME_HMR_PATH_PREFIXES.some((prefix) =>
    relativePath.startsWith(prefix),
  );
}

export function createBaryonRuntimeHmrPlugin({ workspaceRoot }) {
  return {
    name: "baryon-runtime-full-reload",
    apply: "serve",
    hotUpdate({ file, modules, timestamp }) {
      if (
        this.environment.name !== "client" ||
        !shouldForceBaryonRuntimeReload(file, { workspaceRoot })
      ) {
        return undefined;
      }

      const invalidatedModules = new Set();
      for (const module of modules) {
        this.environment.moduleGraph.invalidateModule(
          module,
          invalidatedModules,
          timestamp,
          true,
        );
      }
      this.environment.hot.send({ type: "full-reload" });
      return [];
    },
  };
}

function createExactSpecifierPattern(specifier) {
  return new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

function createWorkspacePackageAliases({
  workspaceRoot,
  packageDirectory,
  manifest,
}) {
  const packageRoot = path.resolve(workspaceRoot, packageDirectory);
  const manifestPath = path.join(packageRoot, "package.json");
  const packageName = manifest.name;
  const packageExports = manifest.exports;

  if (typeof packageName !== "string" || packageName.length === 0) {
    throw new TypeError(`${manifestPath} must declare a package name`);
  }
  if (
    !packageExports ||
    typeof packageExports !== "object" ||
    Array.isArray(packageExports)
  ) {
    throw new TypeError(`${manifestPath} must declare named package exports`);
  }

  return Object.entries(packageExports).map(([subpath, target]) => {
    if (subpath !== "." && !subpath.startsWith("./")) {
      throw new TypeError(
        `${packageName} export ${subpath} must be a package subpath`,
      );
    }
    if (typeof target !== "string" || !target.startsWith("./")) {
      throw new TypeError(
        `${packageName} export ${subpath} must have one relative source target`,
      );
    }

    const replacement = path.resolve(packageRoot, target);
    const relativeTarget = path.relative(packageRoot, replacement);
    if (
      relativeTarget === ".." ||
      relativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeTarget)
    ) {
      throw new TypeError(
        `${packageName} export ${subpath} must stay inside its package`,
      );
    }

    const specifier =
      subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
    return {
      find: createExactSpecifierPattern(specifier),
      replacement,
    };
  });
}

export function createBaryonWorkspaceAliases({ workspaceRoot }) {
  return BARYON_RENDERER_WORKSPACE_PACKAGES.flatMap(({ directory, manifest }) =>
    createWorkspacePackageAliases({
      workspaceRoot,
      packageDirectory: directory,
      manifest,
    }),
  );
}

/** @returns {import('vite').UserConfig} */
export function createBaseViteConfig({ workspaceRoot = null } = {}) {
  /** @type {import('vite').PluginOption[]} */
  const plugins = [
    react(),
    glsl(),
    workspaceRoot ? createBaryonRuntimeHmrPlugin({ workspaceRoot }) : null,
    {
      name: "load+transform-js-files-as-jsx",
      transform: {
        filter: {
          id: /[\\/]src[\\/].*\.js$/,
          code: /<[/A-Za-z>]/,
        },
        async handler(code, id) {
          return transformWithOxc(code, id, {
            lang: "jsx",
            jsx: {
              runtime: "automatic",
            },
          });
        },
      },
    },
  ].filter(Boolean);

  return {
    build: {
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          minify: {
            compress: {
              dropConsole: true,
              dropDebugger: true,
            },
          },
          manualChunks: undefined,
        },
      },
      sourcemap: "hidden",
    },
    plugins,
  };
}
