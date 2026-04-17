import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  baryonCommonOptimizeDepsInclude,
  baryonCommonViteDedupe,
  createBaseViteConfig,
  createBaryonWorkspaceAliases,
} from "@baryon/config";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Resolve zustand v5 relative to this package (direct dep), so pnpm strict
// isolation always finds the right version regardless of what gets hoisted.
const zustandDir = path.dirname(require.resolve("zustand/package.json"));

/** @returns {import('vite').UserConfig} */
export default defineConfig(() => {
  const isHttps = process.env.HTTPS === "true";
  const base = createBaseViteConfig();
  const workspaceRoot = path.resolve(dirname, "../..");
  const workspaceAliases = createBaryonWorkspaceAliases({ workspaceRoot });
  /** @type {import('vite').PluginOption[]} */
  const plugins = [
    tailwindcss(),
    ...base.plugins,
    isHttps ? basicSsl() : null,
  ].filter(Boolean);

  return {
    ...base,
    plugins,
    server: {
      host: true,
      https: isHttps ? {} : undefined,
      fs: {
        allow: [workspaceRoot],
      },
      open: !(
        "SANDBOX_URL" in process.env || "CODESANDBOX_HOST" in process.env
      ),
    },
    build: {
      ...base.build,
      outDir: "dist",
    },
    optimizeDeps: {
      // Visualizer sources use Vite-specific resource imports, so keep the linked
      // package itself out of prebundling and seed its deep third-party imports.
      exclude: ["@baryon/visualizer"],
      include: baryonCommonOptimizeDepsInclude,
      holdUntilCrawlEnd: true,
    },
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(dirname, "./src") },
        ...workspaceAliases,
        // Force zustand (and its subpaths) to resolve from apps/web's own v5
        // copy, preventing tunnel-rat's nested zustand@4 (via @react-three/drei)
        // from being picked up by Rollup's CommonJS resolver. Using createRequire
        // to find the path dynamically works under pnpm@9 strict isolation where
        // hardcoded root-relative paths may point to the wrong (v4) copy.
        { find: /^zustand$/, replacement: zustandDir },
        {
          find: /^zustand\/traditional$/,
          replacement: path.join(zustandDir, "traditional.js"),
        },
      ],
      // Force single instances of packages that break when duplicated.
      // @baryon/app-shell as a workspace package can otherwise pull in its own copies.
      dedupe: baryonCommonViteDedupe,
    },
  };
});
