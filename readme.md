# Baryon

Baryon is a monorepo for a real-time cymatic audio visualizer and its host applications. The shared engine lives in `packages/visualizer` and `packages/app-shell`; the current flagship renderer is the WebGPU volumetric raymarch path.

This README is the repo entrypoint. It covers setup, common commands, and where the canonical docs live.

## Surfaces

```text
apps/
  web/        @baryon/web       Free discovery surface
  desktop/    @baryon/desktop   Flagship Electron product
  marketing/  @baryon/marketing Static-first marketing site
packages/
  app-shell/  @baryon/app-shell Shared React shell and orchestration
  visualizer/ @baryon/visualizer Shared audio + visualization engine
  config/     @baryon/config    Shared Vite and Vitest config
```

See [`ROADMAP.md`](ROADMAP.md) for product direction and release priorities.

## Licensing

The Baryon engine is available under the **PolyForm Strict License 1.0.0** for personal, non-commercial use. A Commercial License is required to distribute any product built on the engine, whether free or paid.

See [`LICENSING.md`](LICENSING.md) for the summary and [`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md) for commercial-use details.

## Prerequisites

- Node.js `24` via [`.nvmrc`](.nvmrc)
- `pnpm`
- Playwright Chromium for browser acceptance tests, installed on demand

Install from the repo root:

```bash
pnpm install
```

`pnpm install` also runs the repo `prepare` script and installs the committed Husky hooks.

To front-load the public and Vercel preflight checks before the normal
`pnpm verify` push gate, temporarily opt into:

```bash
BARYON_PRE_PUSH_PREFLIGHT=1 git push
```

`pnpm preflight:web:vercel` defaults to the fast local reproduction using
`pnpm@9`. To run the slower local Vercel builder instead, use:

```bash
BARYON_PREFLIGHT_VERCEL_BUILD=1 pnpm preflight:web:vercel
```

## Common Commands

```bash
pnpm dev                  # Start apps/web
pnpm dev:desktop          # Start apps/desktop
pnpm dev:marketing        # Start apps/marketing
pnpm build                # Build all apps and packages
pnpm build:web            # Build apps/web only
pnpm build:marketing      # Build apps/marketing only
pnpm preflight:public     # Fast public-repo CI preflight
pnpm preflight:web:vercel # Fast web build check against the pnpm 9 Vercel path
pnpm repo:map             # Refresh the generated workspace map
pnpm repo:map:check       # Verify the generated workspace map is current
pnpm version:check        # Ensure every workspace manifest matches the repo version
pnpm version:set 1.1.0    # Bump root/apps/packages together
pnpm nav -- workspaces    # List workspaces
pnpm nav -- entrypoints   # List curated entrypoints
pnpm ast -- examples      # Show ast-grep examples
pnpm lint                 # Workspace lint via turbo
pnpm typecheck            # Workspace typecheck where configured
pnpm test:visualizer      # Visualizer unit tests
pnpm test:app-shell       # Shared app-shell unit tests
pnpm test:desktop         # Desktop unit tests
pnpm acceptance:web       # Stable production browser acceptance
pnpm acceptance:desktop   # Packaged desktop shell acceptance
pnpm verify               # Fast local pre-push gate
pnpm verify:acceptance    # Fast gate plus packaged desktop output contracts
pnpm verify:full          # Acceptance verification plus all builds
pnpm docs:check           # Validate doc links, doc invariants, and repo-map freshness
```

Useful package-local commands:

```bash
cd apps/web && pnpm dev:https    # HTTPS dev server for mic testing outside localhost
cd apps/marketing && pnpm preview
cd apps/web && pnpm acceptance:dev
cd apps/desktop && pnpm test:platform
cd apps/desktop && pnpm test:native:verify # Packaged desktop output contracts
cd apps/desktop && pnpm acceptance:shell
cd apps/desktop && pnpm acceptance:native-output
cd apps/desktop && pnpm perf                # Canonical live-source desktop perf probe
cd apps/desktop && pnpm perf:packaged       # Packaged desktop Syphon / OSR benchmark
cd packages/visualizer && pnpm typecheck
```

## Runtime Notes

- WebGPU is the primary renderer path.
- A WebGL2 fallback exists only as a debug and compatibility-testing path. It is not a supported flagship mode.
- Chromium-class browsers are the main supported web target.
- Microphone input requires a secure context such as `https` or `localhost`.

## Versioning

Baryon uses repo-wide versioning. The root manifest is the source of truth, and every app/package manifest must match it exactly.

Use:

```bash
pnpm version:check
pnpm version:set 1.0.1
pnpm release:patch
pnpm release:minor
pnpm release:major
pnpm release:build
```

Normal development does not need version bumps. Use `release:patch`, `release:minor`, or `release:major` when you are cutting a release. Those commands bump every manifest together, create a release commit, and create a matching git tag such as `v1.0.1`.

`release:build` is the guarded packaging path. It refuses to run unless:

- the worktree is clean
- all workspace versions match the root version
- `HEAD` is tagged with the matching release tag, such as `v1.0.1`

That keeps the desktop app, web surface, and shared packages on one release number and makes the release path harder to mis-run.

## Documentation

Start with [`documentation/README.md`](documentation/README.md) for the docs map.

Canonical public/shared docs:

- [`documentation/public/architecture/system-overview.md`](documentation/public/architecture/system-overview.md)
- [`documentation/public/architecture/contracts.md`](documentation/public/architecture/contracts.md)
- [`documentation/public/architecture/output-sync.md`](documentation/public/architecture/output-sync.md)
- [`documentation/public/reference/controls.md`](documentation/public/reference/controls.md)


## Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for contributor setup and PR workflow.
