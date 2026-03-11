/// <reference types="vite/client" />

declare global {
  interface Window {
    __baryonControls?: {
      getState(): Record<string, unknown>;
      setControl(key: string, value: unknown): Record<string, unknown>;
    };
    __baryonControlState?: Record<string, unknown>;
    __baryonAuditSnapshot?: Record<string, unknown>;
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
