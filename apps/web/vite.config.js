import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "node:url";
import { createBaseViteConfig } from "@baryon/config";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @returns {import('vite').UserConfig} */
export default defineConfig(() => {
  const isHttps = process.env.HTTPS === "true";
  const base = createBaseViteConfig();
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
      open: !(
        "SANDBOX_URL" in process.env || "CODESANDBOX_HOST" in process.env
      ),
    },
    build: {
      ...base.build,
      outDir: "dist",
    },
    optimizeDeps: {
      exclude: ["@baryon/visualizer", "@baryon/app-shell"],
    },
    resolve: {
      alias: {
        "@": path.resolve(dirname, "./src"),
        // Force zustand to resolve from the root monorepo copy (v5, which has
        // ./traditional), preventing tunnel-rat's nested zustand@4 from being
        // picked up by Rollup's CommonJS resolver.
        zustand: path.resolve(dirname, "../../node_modules/zustand"),
      },
      // Force single instances of packages that break when duplicated.
      // @baryon/app-shell as a workspace package can otherwise pull in its own copies.
      dedupe: ["react", "react-dom", "three", "@react-three/fiber", "zustand"],
    },
  };
});
