# Contributing to Baryon

Thanks for your interest in contributing. Baryon is an open source project
under AGPL-3.0. Contributions are welcome from everyone.

## CLA — required before your first PR is merged

Baryon uses a Contributor License Agreement so that your contributions can
be used in both the open source engine and Baryon's commercial products.

When you open your first pull request, a bot will post a comment asking you
to sign. Reply with:

> I have read the CLA Document and I hereby sign the CLA

The CLA text is in [`CLA.md`](../CLA.md) at the root of the repo. This is a
one-time step — all future PRs from your GitHub account will be auto-approved.

---

## Setup

Prerequisites: Node.js 18+, `pnpm`, Chrome or Edge (WebGPU required to run the visualizer).

```bash
# Clone the repo (or your fork)
git clone https://github.com/BaryonOfficial/Baryon.git
cd Baryon

# Install all workspace dependencies
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

If you're working on microphone input or anything that needs `SharedArrayBuffer`,
use the HTTPS dev server instead:

```bash
cd apps/web && pnpm dev:https
```

---

## Making changes

Branch from `develop`:

```bash
git checkout develop
git pull
git checkout -b feature/my-thing   # or fix/, docs/
```

Common branch prefixes:

- `feature/` — new functionality
- `fix/` — bug fixes
- `docs/` — documentation only
- `hotfix/` — urgent production patches (branch from `main`)

---

## Before opening a PR

Run the verification gate locally — the same checks CI will run:

```bash
pnpm verify
```

This runs ESLint, typecheck, and the visualizer unit tests. Fix any failures
before pushing.

---

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Common scopes: `(shader)`, `(ui)`, `(core)`, `(deps)`, `(api)`

Examples:

```
feat(core): add per-mode amplitude envelope control
fix(ui): correct tooltip not showing on first hover
docs(api): update controls reference for new granular params
```

Keep the first line under 72 characters. Use the body for context if needed.

---

## Adding controls

New GUI controls must be added through the schema — not inline in the hook:

- `packages/visualizer/src/controls/schema.js` — source of truth
- `packages/visualizer/src/controls/runtime.js` — where each control is applied
- Every `live` control needs explicit runtime coverage (verified by unit tests)
- Include a `title` field with a plain-English tooltip description
- Declare `methods` for which visualization modes the control applies to

See [documentation/controls.md](../documentation/controls.md) for the full
control reference.

---

## Getting help

- **Questions:** [GitHub Discussions](https://github.com/BaryonOfficial/Baryon/discussions)
- **Bugs:** [GitHub Issues](https://github.com/BaryonOfficial/Baryon/issues) — use the bug report template
- **Security vulnerabilities:** email kyledcollins@proton.me privately (see [SECURITY.md](SECURITY.md))
