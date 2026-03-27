declare global {
  interface Window {
    __baryonControls?: {
      getState(): Record<string, unknown>;
      setControl(key: string, value: unknown): Record<string, unknown>;
    };
    __baryonControlState?: Record<string, unknown>;
    __baryonAuditSnapshot?: Record<string, unknown>;
    __baryonFieldCacheOverride?: "direct" | "cached";
    __baryonRendererInfo?: {
      forceWebGLFallbackTest: boolean;
      backendType: "webgl" | "webgpu" | null;
      backend: string | null;
      isFallback: boolean;
      error: string | null;
    };
    __baryonSupportProbe?: {
      status: string;
      failureCode: string | null;
      platform: string;
      browserFamily: string;
      rawError: string | null;
      diagnostics: string[];
      guidance: {
        summary: string;
        steps: string[];
        caveat: string | null;
      } | null;
    };
    __baryonTestReady?: boolean;
  }
}

declare module "three/examples/jsm/tsl/display/BloomNode.js" {
  export function bloom(
    inputNode: any,
    strength?: any,
    radius?: any,
    threshold?: any,
  ): any;
}

export {};
