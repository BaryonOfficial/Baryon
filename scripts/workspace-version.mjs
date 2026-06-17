import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

const manifestPaths = [
  "package.json",
  "apps/desktop/package.json",
  "apps/marketing/package.json",
  "apps/web/package.json",
  "packages/app-shell/package.json",
  "packages/config/package.json",
  "packages/engine/package.json",
];
const existingManifestPaths = manifestPaths.filter((relPath) =>
  fs.existsSync(path.join(rootDir, relPath)),
);

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
