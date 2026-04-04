# Baryon

Baryon is a monorepo for a real-time cymatic audio visualizer and its host applications. The shared engine lives in `packages/visualizer` and `packages/app-shell`; the current flagship renderer is the WebGPU volumetric raymarch path.

This README is the repo entrypoint. It covers setup, common commands, and where the canonical docs live.

## Surfaces

```text
apps/
  web/        @baryon/web       Free discovery surface
  desktop/    @baryon/desktop   Flagship Electron product
  marketing/  @baryon/marketing Marketing site scaffold
packages/
  app-shell/  @baryon/app-shell Shared React shell and orchestration
  visualizer/ @baryon/visualizer Shared audio + visualization engine
  ui/         @baryon/ui        Shared UI utilities
  config/     @baryon/config    Shared Vite and Vitest config
```

See [`ROADMAP.md`](ROADMAP.md) for product direction and release priorities.

## Licensing

The Baryon engine is available under the **PolyForm Strict License 1.0.0** for personal, non-commercial use. A Commercial License is required to distribute any product built on the engine, whether free or paid.

See [`LICENSING.md`](LICENSING.md) for the summary and [`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md) for commercial-use details.

## Prerequisites

- Node.js `24.14.1` via [`.nvmrc`](.nvmrc)
- `pnpm`
- Playwright Chromium for browser smoke tests, installed on demand

Install from the repo root:

```bash
pnpm install
```

`pnpm install` also runs the repo `prepare` script and installs the committed Husky hooks.

## Common Commands

```bash
pnpm dev                  # Start apps/web
pnpm dev:desktop          # Start apps/desktop
pnpm build                # Build all apps and packages
pnpm build:web            # Build apps/web only
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
pnpm test:web-smoke       # Stable production browser smoke
pnpm verify               # Local pre-push gate
pnpm verify:full          # Full verification including builds
pnpm docs:check           # Validate doc links, doc invariants, and repo-map freshness
```

Useful package-local commands:

```bash
cd apps/web && pnpm dev:https    # HTTPS dev server for mic testing outside localhost
cd apps/web && pnpm test:smoke:dev
cd apps/desktop && pnpm test:platform
cd apps/desktop && pnpm test:smoke
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
```

That keeps the desktop app, web surface, and shared packages on the same release number.

## Documentation

Start with [`documentation/README.md`](documentation/README.md) for the docs map.

Canonical public/shared docs:

- [`documentation/public/architecture/system-overview.md`](documentation/public/architecture/system-overview.md)
- [`documentation/public/architecture/contracts.md`](documentation/public/architecture/contracts.md)
- [`documentation/public/architecture/output-sync.md`](documentation/public/architecture/output-sync.md)
- [`documentation/public/reference/controls.md`](documentation/public/reference/controls.md)


## Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for contributor setup and PR workflow.
