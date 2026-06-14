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

  if (!syncPublic.includes("docs/public")) {
    errors.push("scripts/sync-public.sh: missing docs/public export");
  }

  if (!syncPublic.includes("docs/docs.json")) {
    errors.push("scripts/sync-public.sh: missing Mintlify docs.json export");
  }

  if (!syncPublic.includes("docs/index.mdx")) {
    errors.push("scripts/sync-public.sh: missing Mintlify index page export");
  }

  if (!syncPublic.includes("docs/package.json")) {
    errors.push("scripts/sync-public.sh: missing Mintlify package export");
  }

  if (!syncPublic.includes(".nvmrc")) {
    errors.push("scripts/sync-public.sh: missing .nvmrc export");
  }

  if (!syncPublic.includes(".dependency-cruiser.cjs")) {
    errors.push(
      "scripts/sync-public.sh: missing .dependency-cruiser.cjs export",
    );
  }

  if (!syncPublic.includes("scripts/check-docs.mjs")) {
    errors.push(
      "scripts/sync-public.sh: missing scripts/check-docs.mjs export",
    );
  }

  if (!syncPublic.includes("scripts/workspace-version.mjs")) {
    errors.push(
      "scripts/sync-public.sh: missing scripts/workspace-version.mjs export",
    );
  }

  if (
    syncPublic.includes("docs/internal") &&
    !syncPublic.includes(
      "Excluded: apps/desktop, apps/marketing, internal documentation",
    )
  ) {
    errors.push(
      "scripts/sync-public.sh: internal documentation appears to be exported",
    );
  }
}

const polyformLicense = "LicenseRef-PolyForm-Strict-1.0";
const expectedLicenses = new Map([
  ["package.json", polyformLicense],
  ["apps/web/package.json", polyformLicense],
  ["packages/app-shell/package.json", polyformLicense],
  ["packages/visualizer/package.json", polyformLicense],
  ["packages/config/package.json", polyformLicense],
  ["apps/desktop/package.json", "UNLICENSED"],
  ["apps/marketing/package.json", "UNLICENSED"],
]);

for (const [relPath, expectedLicense] of expectedLicenses) {
  if (!fs.existsSync(path.join(rootDir, relPath))) {
    continue;
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, relPath), "utf8"),
  );
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
