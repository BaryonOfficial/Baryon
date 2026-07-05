import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

const markdownFiles = [];
const skipDirs = new Set([
  ".git",
  ".claude",
  "node_modules",
  "dist",
  "coverage",
  "tmp",
]);
const markdownExtensions = new Set([".md", ".mdx"]);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (markdownExtensions.has(path.extname(entry.name))) {
      markdownFiles.push(fullPath);
    }
  }
}

walk(rootDir);

const errors = [];
const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const absoluteLocalPathPattern = /(?:\]\(|`)(\/Users\/|\/home\/|[A-Za-z]:\\)/;

function toRepoRelative(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function scriptExists(relPath) {
  return fs.existsSync(path.join(rootDir, relPath));
}

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

function localLinkTargetExists(resolvedPath, allowExtensionless = false) {
  if (fs.existsSync(resolvedPath)) {
    return true;
  }

  if (!allowExtensionless || path.extname(resolvedPath)) {
    return false;
  }

  return [".md", ".mdx", "/index.md", "/index.mdx"].some((suffix) =>
    fs.existsSync(`${resolvedPath}${suffix}`),
  );
}

for (const filePath of markdownFiles) {
  const text = fs.readFileSync(filePath, "utf8");
  const relPath = toRepoRelative(filePath);
  const isMintlifyPage =
    relPath.startsWith("docs/") && path.extname(filePath) === ".mdx";

  if (absoluteLocalPathPattern.test(text)) {
    errors.push(`${relPath}: contains an absolute local filesystem path`);
  }

  for (const match of text.matchAll(markdownLinkPattern)) {
    const target = match[1];
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    if (target.startsWith("/")) {
      if (isMintlifyPage) {
        const resolved = path.join(rootDir, "docs", target.slice(1));
        if (!localLinkTargetExists(resolved, true)) {
          errors.push(
            `${relPath}: broken Mintlify root link '${target}' -> ${toRepoRelative(resolved)}`,
          );
        }
        continue;
      }

      errors.push(`${relPath}: non-portable absolute link target '${target}'`);
      continue;
    }

    const resolved = path.resolve(path.dirname(filePath), target);
    if (!localLinkTargetExists(resolved, isMintlifyPage)) {
      errors.push(
        `${relPath}: broken relative link '${target}' -> ${toRepoRelative(resolved)}`,
      );
    }
  }
}

const nvmrcVersion = fs
  .readFileSync(path.join(rootDir, ".nvmrc"), "utf8")
  .trim();
const rootReadme = fs.readFileSync(path.join(rootDir, "readme.md"), "utf8");
const contributing = fs.readFileSync(
  path.join(rootDir, ".github/CONTRIBUTING.md"),
  "utf8",
);
const licensing = fs.readFileSync(path.join(rootDir, "LICENSING.md"), "utf8");

for (const [name, text] of [
  ["readme.md", rootReadme],
  [".github/CONTRIBUTING.md", contributing],
]) {
  if (!text.includes(nvmrcVersion)) {
    errors.push(`${name}: missing Node version ${nvmrcVersion} from .nvmrc`);
  }
}

const duplicateGuardFiles = [
  "readme.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".github/CONTRIBUTING.md",
]
  .map((relPath) => path.join(rootDir, relPath))
  .filter((filePath) => fs.existsSync(filePath));

const forbiddenPatterns = [
  /^## Current Architecture$/m,
  /^## Architecture Overview$/m,
  /^## Testing$/m,
  /^## GUI Controls And Verification$/m,
  /^## Navigation Tooling$/m,
  /bootstrap \/ bootstrap acknowledgment/,
  /rendered-frame acknowledgment/,
];

for (const filePath of duplicateGuardFiles) {
  const text = fs.readFileSync(filePath, "utf8");
  const relPath = toRepoRelative(filePath);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      errors.push(
        `${relPath}: contains forbidden duplicated doc content (${pattern})`,
      );
    }
  }
}

if (scriptExists("scripts/generate-repo-map.mjs")) {
  try {
    execFileSync("node", ["scripts/generate-repo-map.mjs", "--check"], {
      cwd: rootDir,
      stdio: "pipe",
    });
  } catch {
    errors.push(
      "docs/internal/generated/repo-map.md is stale; run 'pnpm repo:map' and commit the updated generated file",
    );
  }
}

if (scriptExists("scripts/contract-desktop-bridge.mjs")) {
  try {
    execFileSync("node", ["scripts/contract-desktop-bridge.mjs", "--check"], {
      cwd: rootDir,
      stdio: "pipe",
    });
  } catch {
    errors.push(
      "docs/internal/generated/desktop-bridge-contract.md is stale or the desktop bridge contract has drifted; run 'pnpm contract:desktop-bridge' and resolve the mismatch",
    );
  }
}

try {
  execFileSync("node", ["scripts/workspace-version.mjs", "--check"], {
    cwd: rootDir,
    stdio: "pipe",
  });
} catch {
  errors.push(
    "workspace package versions are out of sync with the root version",
  );
}

if (scriptExists("scripts/sync-public.sh")) {
  const syncPublic = fs.readFileSync(
    path.join(rootDir, "scripts/sync-public.sh"),
    "utf8",
  );
  const hasProjectionHelper = scriptExists("scripts/lib/public-export.mjs");
  const publicExportManifest = hasProjectionHelper
    ? fs.readFileSync(
        path.join(rootDir, "scripts/lib/public-export.mjs"),
        "utf8",
      )
    : syncPublic;

  if (!publicExportManifest.includes("docs/public")) {
    errors.push("public export manifest: missing docs/public export");
  }

  if (!publicExportManifest.includes("docs/README.md")) {
    errors.push("public export manifest: missing public docs root map export");
  }

  if (!publicExportManifest.includes("docs/docs.json")) {
    errors.push("public export manifest: missing Mintlify docs.json export");
  }

  if (!publicExportManifest.includes("docs/index.mdx")) {
    errors.push("public export manifest: missing Mintlify index page export");
  }

  if (!publicExportManifest.includes("docs/package.json")) {
    errors.push("public export manifest: missing Mintlify package export");
  }

  if (!publicExportManifest.includes(".nvmrc")) {
    errors.push("public export manifest: missing .nvmrc export");
  }

  if (!publicExportManifest.includes(".dependency-cruiser.cjs")) {
    errors.push(
      "public export manifest: missing .dependency-cruiser.cjs export",
    );
  }

  if (!publicExportManifest.includes("scripts/check-docs.mjs")) {
    errors.push(
      "public export manifest: missing scripts/check-docs.mjs export",
    );
  }

  if (!publicExportManifest.includes("scripts/workspace-version.mjs")) {
    errors.push(
      "public export manifest: missing scripts/workspace-version.mjs export",
    );
  }

  if (
    hasProjectionHelper &&
    (!publicExportManifest.includes("validatePublicProjection") ||
      !syncPublic.includes("--validate-only"))
  ) {
    errors.push("public export manifest: missing projection validation");
  }

  if (
    publicExportManifest.includes("docs/internal") &&
    !syncPublic.includes("Excluded: private application workspaces")
  ) {
    errors.push(
      "public export manifest: internal documentation appears exported",
    );
  }
}

function checkTouchDesignerDownload({
  pagePath,
  artifactPath,
  sourceArtifactPath = null,
  publicUrl,
  label,
}) {
  const absolutePagePath = path.join(rootDir, pagePath);
  if (!fs.existsSync(absolutePagePath)) {
    return;
  }

  const page = fs.readFileSync(absolutePagePath, "utf8");
  if (!fs.existsSync(path.join(rootDir, artifactPath))) {
    errors.push(`${artifactPath}: missing ${label}`);
  }
  if (!page.includes(publicUrl)) {
    errors.push(`${pagePath}: ${label} must use downloads.baryon.live`);
  }

  if (!sourceArtifactPath) {
    return;
  }

  const sourcePath = path.join(rootDir, sourceArtifactPath);
  const docsPath = path.join(rootDir, artifactPath);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(docsPath)) {
    return;
  }

  if (!fs.readFileSync(sourcePath).equals(fs.readFileSync(docsPath))) {
    errors.push(`${artifactPath}: must match ${sourceArtifactPath}`);
  }
}

checkTouchDesignerDownload({
  pagePath: "docs/public/desktop/parameter-automation.mdx",
  artifactPath: "docs/public/downloads/touchdesigner/baryon_osc.tox",
  sourceArtifactPath: "scripts/touchdesigner/baryon_osc.tox",
  publicUrl: "https://downloads.baryon.live/touchdesigner/baryon_osc.tox",
  label: "TouchDesigner control surface artifact",
});

checkTouchDesignerDownload({
  pagePath: "docs/public/desktop/osc-structure-export.mdx",
  artifactPath: "docs/public/downloads/touchdesigner/baryon_osc_structure.tox",
  sourceArtifactPath: "scripts/touchdesigner/baryon_osc_structure.tox",
  publicUrl:
    "https://downloads.baryon.live/touchdesigner/baryon_osc_structure.tox",
  label: "TouchDesigner structure monitor artifact",
});

const polyformLicense = "LicenseRef-PolyForm-Strict-1.0";
for (const relPath of findWorkspaceManifestPaths()) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, relPath), "utf8"),
  );
  const expectedLicense =
    packageJson.license === "UNLICENSED" ? "UNLICENSED" : polyformLicense;
  const actualLicense = packageJson.license ?? null;
  if (actualLicense !== expectedLicense) {
    errors.push(
      `${relPath}: expected license '${expectedLicense}' but found '${actualLicense}'`,
    );
  }
}

if (!licensing.includes("PolyForm Strict License 1.0.0")) {
  errors.push("LICENSING.md: expected PolyForm Strict license summary");
}

if (errors.length) {
  console.error("docs:check failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`docs:check passed for ${markdownFiles.length} markdown files`);
