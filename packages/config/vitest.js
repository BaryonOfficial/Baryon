import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import { createBaseViteConfig } from "./vite.base.js";

/**
 * Shared Vitest config for pure JS/React workspaces.
 * Packages can either layer additions on top of the shared base Vite config,
 * or hand in a fully resolved Vite config when they already have one.
 *
 * @param {{
 *   vite?: import("vite").UserConfig,
 *   viteConfig?: import("vite").UserConfig | (() => import("vite").UserConfig),
 *   test?: import("vite").UserConfig["test"],
 * }} [options]
 * @returns {import("vite").UserConfig}
 */
export function createWorkspaceVitestConfig(options = {}) {
  const baseViteConfig =
    options.viteConfig == null
      ? mergeConfig(createBaseViteConfig(), options.vite ?? {})
      : typeof options.viteConfig === "function"
        ? options.viteConfig()
        : options.viteConfig;

  return mergeConfig(
    baseViteConfig,
    defineConfig({
      test: {
        environment: "node",
        include: ["src/**/*.test.js"],
        ...options.test,
      },
    }),
  );
}
