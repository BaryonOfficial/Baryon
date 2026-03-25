# Baryon

Baryon is a monorepo for a 3D audio visualizer and its host applications. The current production renderer is a WebGPU volumetric raymarched cymatics visualizer driven by a shared CPU audio/modal pipeline.

This README is the developer entrypoint: setup, architecture, workflows, and the repo rules that matter when changing the visualizer.

## Monorepo

```text
apps/
  web/        @baryon/web       Vite + React + R3F visualizer app
  desktop/    @baryon/desktop   Flagship Electron desktop product shell
  marketing/  @baryon/marketing Marketing site scaffold
packages/
  app-shell/  @baryon/app-shell  Shared React shell: AudioProvider, scene surface, listener UI
  visualizer/ @baryon/visualizer Core audio + visualization engine
  ui/         @baryon/ui         Shared UI utilities
  config/     @baryon/config     Shared Vite config
```

`apps/web` consumes the default listener-first `App` export from `@baryon/app-shell`. `apps/desktop` composes its own desktop wrapper around named `@baryon/app-shell` exports so desktop-only mode chrome and performer UI stay out of the shared renderer shell. Static runtime assets stay app-local under each app's `public/` directory because they are loaded by URL at runtime.

## Product Roadmap

Baryon has two product surfaces:

- `apps/web` is the free funnel product: a high-quality cymatic visualizer for discovery, file playback, and mic-driven exploration.
- `apps/desktop` is the paid flagship product: a licensed Electron app for live-performance and studio workflows.

Current roadmap priorities, derived from the PRD:

1. Keep the web app strong as a genuine demo, not a crippled teaser.
2. Ship the desktop MVP as an Electron app with live audio input, flagship WebGPU volumetric rendering, and on-screen playback.
3. Add Syphon on macOS and Spout on Windows so Baryon can be used as a source in TouchDesigner, Resolume, and related tools.
4. Add OSC input for external parameter automation.
5. Ship the first paid desktop release on macOS and Windows, with Linux as best-effort visualization-only support.

Current engineering direction for performance work:

- shared-core `AudioFeatureEngine` optimization lands first so both web and desktop benefit
- desktop-only transport and host acceleration come after remeasurement, once the remaining bottlenecks are clearly desktop-specific
- cymatic semantics should stay materially intact while performance work lands

See [`ROADMAP.md`](ROADMAP.md) for the public roadmap and phase breakdown.

Additional engineering reference docs:

Public-facing/shared docs:

- [`documentation/public/architecture-map.md`](documentation/public/architecture-map.md)
- [`documentation/public/contracts-and-boundaries.md`](documentation/public/contracts-and-boundaries.md)
- [`documentation/public/output-integration-architecture.md`](documentation/public/output-integration-architecture.md)
- [`documentation/public/controls.md`](documentation/public/controls.md)


## Licensing

The Baryon engine is available under the **PolyForm Strict License 1.0.0** for
personal, non-commercial use. A Commercial License is required to distribute
any product built on the engine, whether free or paid.

See [`LICENSING.md`](LICENSING.md) for the full summary, and
[`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md) for commercial use details.

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
pnpm --filter @baryon/desktop test:smoke   # Packaged Electron desktop shell smoke
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

cd apps/desktop && pnpm typecheck
cd apps/desktop && pnpm test:smoke

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
pnpm --filter @baryon/desktop test:smoke
pnpm build:web
```

That keeps the pre-push gate strict without forcing Playwright/browser setup or product-specific build toolchains on every push.

Generated output:

- `apps/web/dist/` is build output from Vite, not source. Treat it as disposable local output during review and cleanup work.

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

Important shared renderer pieces:

- `packages/app-shell/src/App.jsx`
- `packages/app-shell/src/components/ThreeScene.jsx`
- `packages/app-shell/src/components/AudioControls.jsx`
- `packages/app-shell/src/components/hooks/useBrowserSupportState.js`
- `packages/app-shell/src/components/hooks/useRendererModeState.js`
- `packages/app-shell/src/components/BaryonScene.jsx`
- `packages/app-shell/src/components/hooks/useBaryonControls.js`
- `packages/app-shell/src/components/hooks/useBaryonPipeline.js`
- `packages/app-shell/src/components/hooks/useBaryonVisualizer.js`

Where to change common renderer concerns:

- WebGPU/browser gating and user-facing support diagnostics live in `packages/app-shell/src/components/browserSupport.js` and `packages/app-shell/src/components/hooks/useBrowserSupportState.js`.
- Renderer init diagnostics and backend bookkeeping live in `packages/app-shell/src/components/rendererDiagnostics.js`.
- Linux browser diagnostics automation keeps its side effects in `apps/web/scripts/linux-webgpu-diagnostics.mjs` and its pure classification/formatting logic in `apps/web/scripts/linux-webgpu-diagnostics-helpers.mjs`.
- Runtime-loaded assets stay app-local in `apps/web/public/` and `apps/desktop/public/`.
- `packages/app-shell/src/context/AudioProvider.jsx`

The shared scene is intentionally hook-composed now:

- controls
- pipeline
- visualizer runtime

Avoid re-centralizing that logic into a single god component.

Desktop-specific renderer composition now lives in `apps/desktop/src/DesktopApp.jsx`, `apps/desktop/src/context/AppModeProvider.jsx`, and `apps/desktop/src/components/`. `@baryon/app-shell` exports the shared building blocks (`AppFrame`, `AudioProvider`, `SceneSurface`, `ListenerControls`) but does not own desktop-only mode state or performer UI.

## GUI Controls And Verification

The control surface is schema-driven. For a full reference of every control, what it does, and how the controls interact, see [`documentation/public/controls.md`](documentation/public/controls.md).

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

`apps/desktop` is the current shell for the flagship Electron desktop host. Shared audio UI behavior remains available through:

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
