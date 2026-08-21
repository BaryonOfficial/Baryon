import type { UserConfig } from "vite";

export declare const baryonCommonViteDedupe: string[];
export declare const baryonCommonOptimizeDepsInclude: string[];
export declare function createBaryonWorkspaceAliases(options: {
  workspaceRoot: string;
}): {
  find: string | RegExp;
  replacement: string;
}[];
export declare function shouldForceBaryonRuntimeReload(
  file: string,
  options: { workspaceRoot: string },
): boolean;
export declare function createBaryonRuntimeHmrPlugin(options: {
  workspaceRoot: string;
}): import("vite").Plugin;
export declare function createBaseViteConfig(options?: {
  workspaceRoot?: string | null;
}): UserConfig;
