import type { UserConfig } from "vite";

export declare const baryonCommonViteDedupe: string[];
export declare const baryonCommonOptimizeDepsInclude: string[];
export declare function createBaryonWorkspaceAliases(options: {
  workspaceRoot: string;
}): {
  find: string | RegExp;
  replacement: string;
}[];
export declare function createBaseViteConfig(): UserConfig;
