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
    resolve: {
      alias: {
        "@": path.resolve(dirname, "./src"),
      },
    },
  };
});
