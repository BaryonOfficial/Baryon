import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

function findWorkspaceManifestPaths() {
  const workspaceRoots = ["apps", "packages"];
  const manifestPaths = ["package.json"];

  for (const workspaceRoot of workspaceRoots) {
    const workspaceRootPath = path.join(rootDir, workspaceRoot);
    if (!fs.existsSync(workspaceRootPath)) {
      continue;
    }

    for (const entry of fs.readdirSync(workspaceRootPath, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = path.join(workspaceRoot, entry.name, "package.json");
      if (fs.existsSync(path.join(rootDir, manifestPath))) {
        manifestPaths.push(manifestPath);
      }
    }
  }

  return manifestPaths.sort();
}

const existingManifestPaths = findWorkspaceManifestPaths();

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const versionArg = args.find((arg) => arg !== "--check");
const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readManifest(relPath) {
  const absPath = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function writeManifest(relPath, manifest) {
  const absPath = path.join(rootDir, relPath);
  fs.writeFileSync(absPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const rootManifest = readManifest("package.json");
const targetVersion = versionArg ?? rootManifest.version;

if (!semverPattern.test(targetVersion)) {
  console.error(
    "Usage: node scripts/workspace-version.mjs [--check] <semver-version>",
  );
  console.error(`Received invalid version: ${targetVersion}`);
  process.exit(1);
}

const mismatches = [];
for (const relPath of existingManifestPaths) {
  const manifest = readManifest(relPath);
  if (manifest.version !== targetVersion) {
    mismatches.push({
      relPath,
      currentVersion: manifest.version,
    });
  }
}

if (checkOnly) {
  if (mismatches.length) {
    console.error(`Workspace version mismatch. Expected ${targetVersion}.`);
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch.relPath}: ${mismatch.currentVersion}`);
    }
    process.exit(1);
  }

  console.log(`Workspace versions are aligned at ${targetVersion}`);
  process.exit(0);
}

for (const relPath of existingManifestPaths) {
  const manifest = readManifest(relPath);
  manifest.version = targetVersion;
  writeManifest(relPath, manifest);
}

console.log(
  `Updated ${existingManifestPaths.length} workspace manifests to version ${targetVersion}`,
);
