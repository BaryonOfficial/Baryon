# Baryon

Baryon is a monorepo for a 3D audio visualizer and its host applications. The current production renderer is a WebGPU volumetric raymarched cymatics visualizer driven by a shared CPU audio/modal pipeline.

This README is the developer entrypoint: setup, architecture, workflows, and the repo rules that matter when changing the visualizer.

## Monorepo

```text
apps/
  web/        @baryon/web       Vite + React + R3F visualizer app
  desktop/    @baryon/desktop   Neutral desktop app shell reserved for the flagship desktop product
  marketing/  @baryon/marketing Marketing site scaffold
packages/
  visualizer/ @baryon/visualizer Core audio + visualization engine
  ui/         @baryon/ui         Shared UI utilities
  config/     @baryon/config     Shared Vite config
```

`apps/web` consumes `@baryon/visualizer` today, and `apps/desktop` is reserved for the future desktop host surface. Static runtime assets such as `public/glb/` remain app-local because they are loaded by URL at runtime.

## Licensing

Baryon's engine (`packages/visualizer`, `packages/ui`, `packages/config`) and web app
(`apps/web`) are licensed under `Elastic License 2.0 (ELv2)`. The canonical license text is in
`LICENSE`.

The desktop app (`apps/desktop`) is a separate commercial product. A desktop license is required
to use distributed builds and is purchased at `baryon.live`.

Public licensing references:

- `LICENSE`
- `LICENSING.md`

## Prerequisites

- Node.js 18+
- `pnpm`
- For browser smoke tests: Playwright Chromium will be installed on demand

Install everything from the repo root:

```bash
pnpm install
```

`pnpm install` also runs the repo's `prepare` script, which installs the committed local Git hooks via Husky.

## Common Commands

From the repo root:

```bash
pnpm dev                  # Start apps/web
pnpm dev:desktop          # Start apps/desktop shell
pnpm build                # Build all apps/packages
pnpm build:web            # Build apps/web only
pnpm format               # Format the repo with Prettier
pnpm format:check         # Check formatting without rewriting files
pnpm lint                 # Workspace lint via turbo
pnpm lint:all             # Repo-wide lint across apps/packages
pnpm typecheck            # Workspace typecheck where configured
pnpm test:visualizer      # Visualizer unit tests
pnpm test:web-smoke       # Stable production browser smoke
pnpm test:web-smoke:dev   # Dev-only control/devtools integration smoke
pnpm verify               # Local pre-push gate: lint, typecheck, visualizer unit test
pnpm verify:full          # Full local verification, including workspace builds
```

Useful package/app-local commands:

```bash
cd apps/web && pnpm dev:https    # HTTPS dev server for mic testing outside localhost
cd apps/web && pnpm build        # Build the production web bundle into dist/
cd apps/web && pnpm preview      # Serve the built dist/ output locally
cd apps/web && pnpm lint
cd apps/web && pnpm typecheck
cd apps/web && pnpm test:smoke
cd apps/web && pnpm test:smoke:dev

cd packages/visualizer && pnpm test
cd packages/visualizer && pnpm typecheck
```

To preview the production web build from the repo root:

```bash
pnpm build:web
pnpm --filter @baryon/web preview
```

Optional fixed host/port:

```bash
pnpm --filter @baryon/web preview -- --host 127.0.0.1 --port 4174
```

## Local Git Hooks

This repo uses Husky for committed local Git hooks.

- `pre-commit` runs `lint-staged`
- staged `*.js` and `*.jsx` files are formatted with Prettier and then auto-fixed with ESLint
- staged `*.ts`, `*.tsx`, `*.json`, `*.md`, and other text config/style files are formatted with Prettier
- `pre-push` runs `pnpm verify`
- product-specific builds stay manual or CI-driven for now

Manual equivalents:

```bash
pnpm format
pnpm lint:all
pnpm typecheck
pnpm test:visualizer
pnpm verify
pnpm verify:full
```

Browser smoke and app-specific builds remain manual or CI-driven for now:

```bash
pnpm test:web-smoke
pnpm build:web
```

That keeps the pre-push gate strict without forcing Playwright/browser setup or product-specific build toolchains on every push.

## Runtime Requirements

Current renderer requirements:

- WebGPU is the premium path for the current volumetric renderer
- Chrome/Edge class browsers are the primary supported web target
- A debug-only WebGL2 fallback toggle exists for compatibility testing, but it is not a flagship rendering target

Audio/browser constraints:

- The visualizer uses Web Audio API analyzers plus a CPU-side spectral modal estimator
- Microphone support requires a secure context (`https` or localhost)
- `pnpm dev` works on localhost
- use `cd apps/web && pnpm dev:https` when testing across devices or when browser security policies require HTTPS

## Current Architecture

### High-level data flow

```text
Audio Input (file or mic)
  -> Web Audio API + active-source analyser
  -> layered spectral/modal estimation on CPU
  -> AudioFeatureFrame
  -> visualization runtime (currently raymarch)
  -> TSL raymarch material
  -> R3F / Three.js render pipeline
```

### Important architectural rules

- Audio and modal estimation are renderer-agnostic and stay on the CPU side.
- `AudioFeatureFrame` is the main seam between audio interpretation and visualization.
- The current runtime is `raymarch`.
- The field engine is layered: backbone structure, detail structure, and transient/band modulation.
- The shared audio/modal layer should remain reusable across future product shells.

### Visualization runtime boundary

Internal visualization runtime scaffolding lives under:

- `packages/visualizer/src/visualization/types.js`
- `packages/visualizer/src/visualization/runtimeFactory.js`
- `packages/visualizer/src/visualization/raymarchRuntime.js`

Today this resolves to the raymarch runtime only. There is no user-facing visualization-method switch.

### Raymarch pipeline

The active renderer is composed from modules in `packages/visualizer/src/core/raymarch/`:

- `uniforms.js`
- `material.js`
- `runtime.js`
- `intersection.js`
- `SafeVolumetricLightingModel.js`

`packages/visualizer/src/core/raymarchSetup.js` is the composition layer for the volumetric renderer.

Current runtime behavior:

- layered modal slots are uploaded to dedicated backbone/detail mode buffers
- the raymarch shader evaluates a volumetric cymatic field inside a spherical bound
- idle falls back to the logo overlay while active states render the volumetric field
- the main seam remains spectral analysis -> `AudioFeatureFrame` -> field-driven volumetric render

### Audio pipeline

Core audio lifecycle lives in:

- `packages/visualizer/src/core/audio/audioSetup.js`

Feature building lives in:

- `packages/visualizer/src/utils/audio/`

Important behavior:

- file and mic are single-source modes
- file and mic use explicit raw Web Audio analysis paths
- test tone injection exists for diagnostics
- modal estimation builds layered backbone/detail structures plus transient/band modulation each frame

## React / App Structure

Important web pieces:

- `apps/web/src/components/ThreeScene.jsx`
- `apps/web/src/components/BaryonScene.jsx`
- `apps/web/src/components/hooks/useBaryonControls.js`
- `apps/web/src/components/hooks/useBaryonPipeline.js`
- `apps/web/src/components/hooks/useBaryonVisualizer.js`
- `apps/web/src/context/AudioProvider.jsx`

The web scene is intentionally hook-composed now:

- controls
- pipeline
- visualizer runtime

Avoid re-centralizing that logic into a single god component.

## GUI Controls And Verification

The control surface is schema-driven. For a full reference of every control, what it does, and how the controls interact, see [`documentation/controls.md`](documentation/controls.md).

Source of truth:

- `packages/visualizer/src/controls/schema.js`

Runtime application:

- `packages/visualizer/src/controls/runtime.js`

Schema audit:

- `packages/visualizer/src/controls/audit.js`

Rules:

- new controls must be added through the schema, not inline in the pane hook
- each control must declare method applicability via `methods`
- each `live` control must have explicit runtime coverage
- `runtimePath` is documentation/audit metadata only, not the real wiring source of truth

Dev/test inspection surfaces:

- `window.__baryonControlState`
- `window.__baryonControls`
- `window.__baryonAuditSnapshot`

These are for verification and smoke tests, not product features.

## Testing

### Unit tests

Visualizer unit tests use Vitest and currently focus on:

- control schema validity
- control runtime wiring
- internal visualization runtime defaults

Run:

```bash
pnpm --filter @baryon/visualizer test
```

### Browser smoke tests

The web app has two browser smoke lanes:

- production smoke in `apps/web/tests/production.smoke.spec.js`
- dev-only control/devtools smoke in `apps/web/tests/controls.smoke.spec.js`

The production smoke is the canonical browser smoke:

```bash
pnpm test:web-smoke
```

The dev-only control smoke remains a narrower manual/CI integration check:

```bash
pnpm test:web-smoke:dev
```

### Recommended verification before merging visualizer changes

```bash
pnpm exec eslint packages/visualizer/src apps/web/src/components/hooks apps/web/tests
pnpm --filter @baryon/visualizer typecheck
pnpm --filter @baryon/visualizer test
pnpm test:web-smoke
pnpm test:web-smoke:dev
```

## Developer Guidance

When making changes:

- Prefer extending the split modules in `packages/visualizer/src/utils/audio/` and `packages/visualizer/src/core/raymarch/` instead of growing facade files again.
- Keep `AudioFeatureFrame` as the only audio-to-visualization seam.
- Keep audit/debug assembly out of core runtime logic where possible.
- Keep control sync logic outside React hooks when feasible.
- Treat the control schema as canonical.
- Keep the visualization runtime boundary intact even while only `raymarch` exists.

## Desktop Notes

`apps/desktop` is now a neutral desktop shell reserved for the future flagship desktop host. Shared audio UI behavior remains available through:

- `packages/visualizer/src/react/useSharedAudioLogic.js`

This is intentionally shared across web and desktop so host-specific wrappers stay thin.

## Contributing

Follow Conventional Commits:

```text
<type>(<scope>): <description>
```

Common types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `chore`

Please also read:

- `CLAUDE.md` for implementation-oriented architecture guidance
- `.github/CONTRIBUTING.md` if contributing through the standard repo flow
