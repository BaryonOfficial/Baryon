# Baryon

Baryon is a monorepo for a 3D audio visualizer and its host applications. The current production renderer is a WebGPU particle-based cymatics visualization driven by a shared CPU audio/modal pipeline.

This README is the developer entrypoint: setup, architecture, workflows, and the repo rules that matter when changing the visualizer.

## Monorepo

```text
apps/
  web/        @baryon/web       Vite + React + R3F visualizer app
  desktop/    @baryon/desktop   Tauri desktop wrapper around the visualizer
  marketing/  @baryon/marketing Marketing site scaffold
packages/
  visualizer/ @baryon/visualizer Core audio + visualization engine
  ui/         @baryon/ui         Shared UI utilities
  config/     @baryon/config     Shared Vite config
```

`apps/web` and `apps/desktop` both consume `@baryon/visualizer`. Static runtime assets such as `public/glb/` and `public/lib/` are duplicated per app because they are loaded by URL at runtime.

## Prerequisites

- Node.js 18+
- `pnpm`
- For `apps/desktop`: Rust and Tauri prerequisites
- For browser smoke tests: Playwright Chromium will be installed on demand

Install everything from the repo root:

```bash
pnpm install
```

## Common Commands

From the repo root:

```bash
pnpm dev                  # Start apps/web
pnpm dev:desktop          # Start apps/desktop
pnpm build                # Build all apps/packages
pnpm build:web            # Build apps/web only
pnpm lint                 # Workspace lint via turbo
pnpm typecheck            # Workspace typecheck where configured
pnpm test:visualizer      # Visualizer unit tests
pnpm test:web-smoke       # Web control wiring smoke test
```

Useful package/app-local commands:

```bash
cd apps/web && pnpm dev:https    # HTTPS dev server for mic / SharedArrayBuffer work
cd apps/web && pnpm build        # Build the production web bundle into dist/
cd apps/web && pnpm preview      # Serve the built dist/ output locally
cd apps/web && pnpm lint
cd apps/web && pnpm typecheck
cd apps/web && pnpm test:smoke

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

## Runtime Requirements

Current renderer requirements:

- WebGPU is required for the particle runtime
- Chrome/Edge class browsers only for the current visualizer path
- No WebGL fallback exists for the current particle renderer

Audio/browser constraints:

- The visualizer uses Web Audio API analyzers plus a CPU-side spectral modal estimator
- Microphone support and some browser audio features require secure context behavior
- `pnpm dev` works on localhost
- use `cd apps/web && pnpm dev:https` when testing across devices or when browser security policies require HTTPS

## Current Architecture

### High-level data flow

```text
Audio Input (file or mic)
  -> Web Audio API + active-source analyser
  -> spectral peak-to-mode estimation on CPU
  -> AudioFeatureFrame
  -> visualization runtime (currently particle)
  -> TSL compute pipeline
  -> R3F / Three.js render pipeline
```

### Important architectural rules

- Audio and modal estimation are renderer-agnostic and stay on the CPU side.
- `AudioFeatureFrame` is the main seam between audio interpretation and visualization.
- The current runtime is `particle`.
- A future `raymarch` renderer is scaffolded conceptually, but not implemented.
- Future raymarching does not need to be ported to TSL. The shared audio/modal layer should feed both renderers.

### Visualization runtime boundary

Internal visualization runtime scaffolding lives under:

- `packages/visualizer/src/visualization/types.js`
- `packages/visualizer/src/visualization/runtimeFactory.js`
- `packages/visualizer/src/visualization/particleRuntime.js`

Today this resolves to the particle runtime only. There is no user-facing visualization-method switch yet.

### TSL / particle pipeline

The particle runtime is composed from modules in `packages/visualizer/src/core/tsl/`:

- `buffers.js`
- `uniforms.js`
- `computeNodes.js`
- `material.js`
- `auditMirror.js`
- `runtime.js`

`packages/visualizer/src/core/tslSetup.js` is now a thin compatibility/composition layer over those modules.

Current runtime behavior:

- `scalarFieldCompute` samples a modal standing-wave field over the fixed sphere domain
- `zeroPointsCompute` writes nodal metadata per sample: potential, render group tag, field magnitude, and gradient magnitude
- `particlesCompute` is velocity-based and field-driven; it uses local field attraction, anchor pull toward each particle's base sample, subordinate flow, damping, and idle-logo fallback
- the old worker/fallback pitch path is gone; the main seam is now spectral analysis -> `AudioFeatureFrame` -> field-driven particle motion

### Audio pipeline

Core audio lifecycle lives in:

- `packages/visualizer/src/core/audio/audioSetup.js`

Feature building lives in:

- `packages/visualizer/src/utils/audio/`

Important behavior:

- file and mic are single-source modes
- live analysis is spectral-only
- test tone injection exists for diagnostics
- modal estimation currently maps a small set of spectral peaks into mode slots each frame

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

The control surface is schema-driven.

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

The web app has a small Playwright smoke test for critical control wiring:

- `apps/web/tests/controls.smoke.spec.js`

It verifies live runtime updates through the real scene using `window.__baryonControlState`.

Run:

```bash
pnpm --filter @baryon/web test:smoke
```

### Recommended verification before merging visualizer changes

```bash
pnpm exec eslint packages/visualizer/src apps/web/src/components/hooks apps/web/tests
pnpm --filter @baryon/visualizer typecheck
pnpm --filter @baryon/visualizer test
pnpm --filter @baryon/web test:smoke
```

## Developer Guidance

When making changes:

- Prefer extending the split modules in `packages/visualizer/src/utils/audio/` and `packages/visualizer/src/core/tsl/` instead of growing old facade files again.
- Keep `AudioFeatureFrame` as the only audio-to-visualization seam.
- Keep audit/debug assembly out of core runtime logic where possible.
- Keep control sync logic outside React hooks when feasible.
- Treat the control schema as canonical.
- Keep the visualization runtime boundary intact even while only `particle` exists.

## Desktop Notes

`apps/desktop` wraps the same visualizer package. Shared audio UI behavior is exposed through:

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
