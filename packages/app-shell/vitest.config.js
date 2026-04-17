import { createWorkspaceVitestConfig } from "@baryon/config/vitest";

export default createWorkspaceVitestConfig({
  vite: {
    resolve: {
      dedupe: ["react", "react-dom", "three", "@react-three/fiber"],
    },
  },
});
