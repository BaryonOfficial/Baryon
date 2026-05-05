# Contributing to Baryon

Thanks for your interest in contributing. Baryon is source-available under
the [PolyForm Strict License 1.0.0](https://polyformproject.org/licenses/strict/1.0.0/) — not an OSI open source license.
Contributions are welcome from everyone.

## CLA — required before your first PR is merged

Baryon uses a Contributor License Agreement so that your contributions can
be used in the engine and Baryon's commercial products.

When you open your first pull request, a bot will post a comment asking you
to sign. Reply with:

> I have read the CLA Document and I hereby sign the CLA

The CLA text is in [`CLA.md`](../CLA.md) at the root of the repo. This is a
one-time step — all future PRs from your GitHub account will be auto-approved.

---

## Setup

Prerequisites: Node.js `24.14.1` from [`.nvmrc`](../.nvmrc), `pnpm`, and Chrome or Edge for the primary WebGPU path.

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

Run the fast verification gate locally — the same default checks CI will run:

```bash
pnpm verify
```

For desktop output/runtime changes or release/pass-boundary work, also run the
packaged desktop acceptance gate:

```bash
pnpm verify:acceptance
```

Fix any failures before pushing.

Release commands such as `pnpm release:patch`, `pnpm release:minor`, and `pnpm release:major` are for release-time only. Do not run them during normal feature work.

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

New GUI controls must be added through the shared control schema and documented in the canonical control reference:

- [`documentation/public/reference/controls.md`](../documentation/public/reference/controls.md)
- [`documentation/public/architecture/contracts.md`](../documentation/public/architecture/contracts.md)
- [`documentation/README.md`](../documentation/README.md)

---

## Getting help

- **Questions:** [GitHub Discussions](https://github.com/BaryonOfficial/Baryon/discussions)
- **Bugs:** [GitHub Issues](https://github.com/BaryonOfficial/Baryon/issues) — use the bug report template
- **Security vulnerabilities:** email kyledcollins@proton.me privately (see [SECURITY.md](SECURITY.md))
