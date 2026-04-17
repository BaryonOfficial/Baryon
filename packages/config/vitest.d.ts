import type { UserConfig } from "vite";

export declare function createWorkspaceVitestConfig(options?: {
  vite?: UserConfig;
  viteConfig?: UserConfig | (() => UserConfig);
  test?: UserConfig["test"];
}): UserConfig;
