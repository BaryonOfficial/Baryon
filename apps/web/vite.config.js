import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createBaseViteConfig } from "@baryon/config";
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
  const appShellRoot = path.resolve(workspaceRoot, "packages/app-shell/src");
  const visualizerRoot = path.resolve(workspaceRoot, "packages/visualizer/src");
  const visualizerAliases = [
    {
      find: /^@baryon\/visualizer$/,
      replacement: path.join(visualizerRoot, "index.js"),
    },
    {
      find: /^@baryon\/visualizer\/audio$/,
      replacement: path.join(visualizerRoot, "core/audio/audioSetup.js"),
    },
    {
      find: /^@baryon\/visualizer\/audio-features$/,
      replacement: path.join(visualizerRoot, "utils/audioFeatures.js"),
    },
    {
      find: /^@baryon\/visualizer\/controls\/persistence$/,
      replacement: path.join(visualizerRoot, "controls/persistence.js"),
    },
    {
      find: /^@baryon\/visualizer\/controls\/runtime$/,
      replacement: path.join(visualizerRoot, "controls/runtime.js"),
    },
    {
      find: /^@baryon\/visualizer\/controls\/schema$/,
      replacement: path.join(visualizerRoot, "controls/schema.js"),
    },
    {
      find: /^@baryon\/visualizer\/defaults$/,
      replacement: path.join(visualizerRoot, "defaults.js"),
    },
    {
      find: /^@baryon\/visualizer\/render\/outputPipeline$/,
      replacement: path.join(visualizerRoot, "render/outputPipeline.js"),
    },
    {
      find: /^@baryon\/visualizer\/react\/useSharedAudioLogic$/,
      replacement: path.join(visualizerRoot, "react/useSharedAudioLogic.js"),
    },
    {
      find: /^@baryon\/visualizer\/three\/loaders$/,
      replacement: path.join(visualizerRoot, "three/loaders/setupLoaders.js"),
    },
    {
      find: /^@baryon\/visualizer\/visualization\/runtime$/,
      replacement: path.join(visualizerRoot, "visualization/runtimeFactory.js"),
    },
    {
      find: /^@baryon\/visualizer\/visualization\/types$/,
      replacement: path.join(visualizerRoot, "visualization/types.js"),
    },
    {
      find: /^@baryon\/visualizer\/styles\.css$/,
      replacement: path.join(visualizerRoot, "styles.css"),
    },
  ];
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
      // Only exclude @baryon/visualizer — it has Vite-specific ?worker/?url imports
      // that esbuild can't process. @baryon/app-shell uses only relative imports so
      // it can be crawled normally.
      exclude: ["@baryon/app-shell", "@baryon/visualizer"],
    },
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(dirname, "./src") },
        {
          find: /^@baryon\/app-shell$/,
          replacement: path.join(appShellRoot, "index.js"),
        },
        {
          find: /^@baryon\/app-shell\/index\.css$/,
          replacement: path.join(appShellRoot, "index.css"),
        },
        ...visualizerAliases,
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
      dedupe: ["react", "react-dom", "three", "@react-three/fiber", "zustand"],
    },
  };
});
