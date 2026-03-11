import { transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react-swc";
import glsl from "vite-plugin-glsl";
import topLevelAwait from "vite-plugin-top-level-await";

/** @returns {import('vite').UserConfig} */
export function createBaseViteConfig() {
  /** @type {import('vite').PluginOption[]} */
  const plugins = [
    react(),
    glsl(),
    topLevelAwait({
      promiseExportName: "__tla",
      promiseImportName: (i) => `__tla_${i}`,
    }),
    {
      name: "load+transform-js-files-as-jsx",
      async transform(code, id) {
        if (!id.match(/src\/.*\.js$/)) return null;
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
  ];

  return {
    /** @type {import('vite').ESBuildOptions} */
    esbuild: {
      drop: /** @type {import('esbuild').Drop[]} */ (["console", "debugger"]),
    },
    build: {
      emptyOutDir: true,
      sourcemap: "hidden",
      rollupOptions: {
        output: { manualChunks: undefined },
      },
    },
    plugins,
  };
}
