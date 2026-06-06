declare module "node:path" {
  interface PathModule {
    join(...paths: string[]): string;
    resolve(...paths: string[]): string;
  }

  const path: PathModule;
  export default path;
}
