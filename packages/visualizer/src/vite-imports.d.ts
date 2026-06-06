// Type declarations for Vite-specific import query suffixes used in this package.

declare module "*?worker" {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

declare module "*?url" {
  const url: string;
  export default url;
}
