declare global {
  interface Window {
    electronAPI?: {
      windowControls?: {
        toggleFullscreen(): Promise<{ fullscreen: boolean }>;
        getFullscreenState(): { fullscreen: boolean };
        subscribeFullscreenState(
          listener: (state: { fullscreen: boolean }) => void,
        ): () => void;
      };
    };
    __baryonControls?: {
      getState(): Record<string, unknown>;
      setControl(key: string, value: unknown): Record<string, unknown>;
    };
    __baryonCameraControls?: {
      setPreset(preset: "top-down" | "side"): void;
      setPose(cameraPose: {
        position?: { x?: number; y?: number; z?: number };
        target?: { x?: number; y?: number; z?: number };
        up?: { x?: number; y?: number; z?: number };
        fov?: number;
      }): void;
    };
    __baryonControlState?: Record<string, unknown>;
    __baryonAuditSnapshot?: Record<string, unknown>;
    __baryonTailDiagnostics?: {
      start(): Record<string, unknown>;
      stop(): Record<string, unknown>;
      reset(): Record<string, unknown>;
      dump(): Record<string, unknown>;
      copy(): Promise<Record<string, unknown>>;
    };
    __baryonPerfMetrics?: Record<string, unknown> | null;
    __baryonExternalOutputDiagnostics?: Record<string, unknown> | null;
    __baryonRendererInfo?: {
      forceWebGLFallbackTest: boolean;
      backendType: "webgl" | "webgpu" | null;
      backend: string | null;
      isFallback: boolean;
      error: string | null;
      gpuErrors?: Array<{
        kind: "uncaptured-error" | "device-lost";
        api: string | null;
        type: string | null;
        message: string;
        reason: string | null;
      }>;
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
