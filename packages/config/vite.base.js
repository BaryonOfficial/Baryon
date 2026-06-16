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
  const visualizerRoot = path.resolve(workspaceRoot, "packages/visualizer/src");

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
      find: /^@baryon\/visualizer\/core\/raymarch\/fieldCache$/,
      replacement: path.join(visualizerRoot, "core/raymarch/fieldCache.js"),
    },
    {
      find: /^@baryon\/visualizer\/core\/raymarch\/performanceGovernor$/,
      replacement: path.join(
        visualizerRoot,
        "core/raymarch/performanceGovernor.js",
      ),
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
