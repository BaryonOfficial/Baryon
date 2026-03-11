import { defineConfig } from "vite";
import { createBaseViteConfig } from "@baryon/config";

export default defineConfig(() => {
  const base = createBaseViteConfig();
  return {
    ...base,
    build: {
      ...base.build,
      outDir: "dist",
    },
  };
});
