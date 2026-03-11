import { defineConfig } from "vite";
import path from "path";
import { createBaseViteConfig } from "@baryon/config";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";

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
      headers: {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
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
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
