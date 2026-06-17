import path from "node:path";
import { transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";

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
  "hls.js",
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

export function createBaryonWorkspaceAliases({ workspaceRoot }) {
  const appShellRoot = path.resolve(workspaceRoot, "packages/app-shell/src");
  const engineRoot = path.resolve(workspaceRoot, "packages/engine/src");

  return [
    {
      find: /^@baryon\/app-shell$/,
      replacement: path.join(appShellRoot, "index.js"),
    },
    {
      find: /^@baryon\/app-shell\/index\.css$/,
      replacement: path.join(appShellRoot, "index.css"),
    },
    {
      find: /^@baryon\/engine$/,
      replacement: path.join(engineRoot, "index.js"),
    },
    {
      find: /^@baryon\/engine\/audio$/,
      replacement: path.join(engineRoot, "core/audio/audioSetup.js"),
    },
    {
      find: /^@baryon\/engine\/audio-features$/,
      replacement: path.join(engineRoot, "utils/audioFeatures.js"),
    },
    {
      find: /^@baryon\/engine\/controls\/persistence$/,
      replacement: path.join(engineRoot, "controls/persistence.js"),
    },
    {
      find: /^@baryon\/engine\/controls\/runtime$/,
      replacement: path.join(engineRoot, "controls/runtime.js"),
    },
    {
      find: /^@baryon\/engine\/controls\/schema$/,
      replacement: path.join(engineRoot, "controls/schema.js"),
    },
    {
      find: /^@baryon\/engine\/core\/raymarch\/fieldCache$/,
      replacement: path.join(engineRoot, "core/raymarch/fieldCache.js"),
    },
    {
      find: /^@baryon\/engine\/core\/raymarch\/performanceGovernor$/,
      replacement: path.join(
        engineRoot,
        "core/raymarch/performanceGovernor.js",
      ),
    },
    {
      find: /^@baryon\/engine\/defaults$/,
      replacement: path.join(engineRoot, "defaults.js"),
    },
    {
      find: /^@baryon\/engine\/render\/outputPipeline$/,
      replacement: path.join(engineRoot, "render/outputPipeline.js"),
    },
    {
      find: /^@baryon\/engine\/react\/useSharedAudioLogic$/,
      replacement: path.join(engineRoot, "react/useSharedAudioLogic.js"),
    },
    {
      find: /^@baryon\/engine\/three\/loaders$/,
      replacement: path.join(engineRoot, "three/loaders/setupLoaders.js"),
    },
    {
      find: /^@baryon\/engine\/visualization\/runtime$/,
      replacement: path.join(engineRoot, "visualization/runtimeFactory.js"),
    },
    {
      find: /^@baryon\/engine\/visualization\/types$/,
      replacement: path.join(engineRoot, "visualization/types.js"),
    },
    {
      find: /^@baryon\/engine\/styles\.css$/,
      replacement: path.join(engineRoot, "styles.css"),
    },
  ];
}

/** @returns {import('vite').UserConfig} */
export function createBaseViteConfig() {
  /** @type {import('vite').PluginOption[]} */
  const plugins = [
    react(),
    glsl(),
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
  ];

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
