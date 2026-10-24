import fs from "node:fs";
import path from "node:path";

export function listWorkspaceManifestPaths(rootDir) {
  const packageJsonPaths = [];

  for (const rootName of ["apps", "packages"]) {
    const rootPath = path.join(rootDir, rootName);
    if (!fs.existsSync(rootPath)) {
      continue;
    }

    const entries = fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.posix.join(rootName, entry.name, "package.json"))
      .filter((candidate) => fs.existsSync(path.join(rootDir, candidate)));

    packageJsonPaths.push(...entries);
  }

  return packageJsonPaths.sort();
}
