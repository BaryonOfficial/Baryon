// Type declarations for Vite-specific import query suffixes used in this package.

declare module "*?worker" {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

declare module "*?url" {
  const url: string;
  export default url;
}

// onnxruntime-web subpath exports — the package's exports map has types but
// some TS language servers don't follow it for subpaths. Re-export from the
// main entrypoint which has identical types.
declare module "onnxruntime-web/wasm" {
  export * from "onnxruntime-web";
}
