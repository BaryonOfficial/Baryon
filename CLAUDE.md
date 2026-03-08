# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                           # Install all workspace deps (run from root)
pnpm dev                               # Start apps/web dev server (HTTP)
cd apps/web && pnpm dev:https          # HTTPS dev server (required for SharedArrayBuffer/mic)
pnpm build                             # Build all apps via Turborepo
pnpm build:web                         # Build apps/web only
cd apps/web && pnpm lint               # ESLint (zero warnings allowed)
```

For fast verification, use:

```bash
pnpm --filter @baryon/visualizer test
pnpm --filter @baryon/visualizer typecheck
pnpm --filter @baryon/web test:smoke
pnpm exec eslint packages/visualizer/src apps/web/src/components/hooks
```

## Monorepo Structure

```
apps/
  web/        @baryon/web       — Vite+React visualizer, deployed to Vercel
  desktop/    @baryon/desktop   — Tauri v2 desktop app (wraps visualizer)
  marketing/  @baryon/marketing — Marketing site scaffold
packages/
  visualizer/ @baryon/visualizer — Core engine (Three.js TSL, WebGPU, audio)
  ui/         @baryon/ui         — cn() utility + shared Tailwind base
  config/     @baryon/config     — Shared Vite base config (createBaseViteConfig)
```

`apps/web` and `apps/desktop` import the visualization engine via `@baryon/visualizer`. Static assets (`public/lib/`, `public/glb/`) are duplicated in each app's `public/` since they are fetched at runtime via URL.

## Architecture Overview

Baryon is a 3D audio visualizer built with React Three Fiber + Three.js WebGPU. Audio analysis drives a GPU compute pipeline using Three.js TSL (Three Shading Language) that renders a cymatics-style particle visualization. **Requires WebGPU** — Chrome/Edge only, no WebGL fallback for the current particle runtime.

### Data Flow

```
Audio Input (file / mic)
  → Web Audio API + active-source analyser (FFT + time domain)
  → Worker pitch service + spectral modal estimation on CPU
  → AudioFeatureFrame (fieldState, modeSlots, fftMagnitudes, averageAmplitude)
  → Visualization runtime (currently particle/TSL)
  → TSL compute pipeline (3 sequential compute stages)
  → PointsNodeMaterial (TSL colorNode + sizeNode) → RenderPipeline
  → TSL bloom node → WebGPURenderer
```

`AudioFeatureFrame` is the main seam between CPU audio interpretation and visualization. TSL should not know about worker/fallback/spectral arbitration details.

### Visualization Runtime Boundary

The codebase now has an internal visualization-method scaffold:

- `packages/visualizer/src/visualization/types.js`
- `packages/visualizer/src/visualization/runtimeFactory.js`
- `packages/visualizer/src/visualization/particleRuntime.js`

Architectural rule:
- audio/modal estimation stays renderer-agnostic and shared
- visualization methods consume `AudioFeatureFrame` downstream
- current implementation is `particle`
- future `raymarch` can remain WebGL2 + GLSL based and does **not** need to be ported to TSL

There is no user-facing visualization-method switch yet. Internally, the default method is `particle`.

### TSL Compute Pipeline (`packages/visualizer/src/core/tslSetup.js`)

`tslSetup.js` is now a thin composition layer over modules in `packages/visualizer/src/core/tsl/`:

- `buffers.js` — initializes base positions, logo positions, storage/attribute buffers
- `uniforms.js` — creates all uniforms and exports field-state enum values
- `computeNodes.js` — defines the TSL compute stages
- `material.js` — creates the `PointsNodeMaterial` holographic particle material
- `auditMirror.js` — CPU-side audit simulation/snapshot generation
- `runtime.js` — per-frame uploads, reset logic, and compute dispatch

The compute stages are:

1. **scalarField** — Computes the 3D standing-wave scalar field from the current `modeSlots`
2. **zeroPoints** — Extracts/retains target nodal positions or logo targets depending on `fieldState`
3. **particles** — Moves particles toward targets with controlled flow/noise

Key functions exported from `@baryon/visualizer`:
- `setupTSL(baryonGeometry, parameters, audioConfig)` — initializes TSL state
- `tickTSL(renderer, tslState, featureFrame, time, deltaTime)` — per-frame compute update
- `disposeTSL(tsl)` — cleanup

### Audio Pipeline (`packages/visualizer/src/core/audio/audioSetup.js`)

- `createAudioContext()` factory — returns an audio instance (not a singleton)
- `getDefaultAudioContext()` — returns shared singleton for backward compat
- File and mic are single-source modes; the visualizer should have one active audio source at a time
- File playback uses `THREE.Audio` + `AudioAnalyser`
- Mic input uses `getUserMedia` + native analyser
- Pitch extraction is worker-based; fallback detection is secondary and intentionally incomplete
- `audio.getState()` — returns live state object used by `createTimeHandler(getState)`
- `packages/visualizer/src/utils/audio/` contains the feature-building pipeline:
  - `analyserState.js`
  - `pitchFallback.js`
  - `modalStack.js`
  - `modalResolvers.js`
  - `fieldState.js`
  - `buildFeatureFrame.js`

`buildAudioFeatureFrame(audioState, featureState, radius)` is the canonical CPU-side modal estimator. It produces:
- `fieldState`
- `modeSlots`
- `fftMagnitudes`
- `averageAmplitude`
- debug/audit metadata

### React Layer

- `apps/web/src/components/ThreeScene.jsx` — Root component; creates R3F `<Canvas>` with `WebGPURenderer`, checks WebGPU support, renders `<BaryonScene>` + UI overlays
- `apps/web/src/components/BaryonScene.jsx` — now a small composition component
- `apps/web/src/components/hooks/useBaryonControls.js` — Tweakpane controls
- `apps/web/src/components/hooks/useBaryonPipeline.js` — render pipeline / bloom setup
- `apps/web/src/components/hooks/useBaryonVisualizer.js` — audio init, logo load, visualization runtime lifecycle, per-frame feature-frame generation + runtime tick
- `apps/web/src/context/AudioProvider.jsx` — owns all audio state, wraps ThreeScene
- `packages/visualizer/src/react/useSharedAudioLogic.js` — shared audio UI hook used by both web and desktop
- `apps/web/src/components/AudioControls.jsx` — UI overlay, reads from `useAudio()`

### Control Surface

The GUI control surface now has a canonical schema in `packages/visualizer/src/controls/`:

- `schema.js` — source of truth for all pane controls, defaults, folders, labels, runtime targets, and status
- controls now also declare visualization-method applicability (`methods`)
- `runtime.js` — pure control-application helpers:
  - `applySharedControls()`
  - `applyParticleControls()`
  - compatibility alias: `applySimulationControls()`
  - `applyBloomControls()`
  - `applyAuditControls()`
  - `applyParticleSceneControls()`
  - compatibility alias: `applySceneControls()`
- `audit.js` — control schema audit helper

Control verification rules:
- Every `live` control must have explicit runtime coverage through the handler layer.
- `runtimePath` is audit metadata only; it is not the real source of truth.
- `packages/visualizer/src/controls/runtime.js` exports `CONTROL_RUNTIME_COVERAGE`, which is what the schema audit and unit tests validate against.

Rules:
- New controls should be added through the control schema, not inline in the hook.
- Pane creation in `useBaryonControls.js` should stay schema-driven.
- Control sync logic should remain testable and outside React hooks where possible.
- New controls should declare which visualization methods they apply to.
- Dev-only control inspection is exposed on `window.__baryonControlState` for future browser smoke tests.
- Dev-only control mutation is exposed on `window.__baryonControls` for browser smoke tests.
- The inspection snapshot is method-aware and includes the current internal visualization method.

### Key Configuration

- **WebGPU**: `ThreeScene.jsx` creates `WebGPURenderer` via R3F's `gl` prop: `await renderer.init()` required before use
- **Tailwind v4**: Uses `@tailwindcss/vite` plugin, `@import "tailwindcss"` in `index.css`, `@theme` blocks; no `postcss.config.js`; `tailwind-merge` v3
- `apps/web/vite.config.js`: Requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers (needed for `SharedArrayBuffer`)
- Shared Vite plugins (react-swc, GLSL, top-level-await, js-as-JSX) are in `packages/config/vite.base.js` via `createBaseViteConfig()`
- All `.js` files in `src/` are treated as JSX
- Path alias `@` maps to `./src` in each app
- Simulation and UI defaults live in `packages/visualizer/src/defaults.js`

### Maintainability Notes

- Prefer extending the split modules in `packages/visualizer/src/utils/audio/` and `packages/visualizer/src/core/tsl/` instead of growing `audioFeatures.js` or `tslSetup.js` again.
- Keep `AudioFeatureFrame` as the single CPU → TSL seam.
- Keep audit/debug snapshot assembly out of primary logic when adding new features.
- If scene complexity grows, add more hooks under `apps/web/src/components/hooks/` instead of re-centralizing logic in `BaryonScene.jsx`.
- `@baryon/visualizer` now has a minimal unit-test harness via `vitest` in `packages/visualizer`.
- `@baryon/web` now has a minimal Playwright smoke harness in `apps/web/tests/controls.smoke.spec.js`.
- Tests are expected to group around:
  - shared control/runtime helpers
  - particle runtime behavior
  - future method-aware scaffolding
- browser smoke for critical control wiring
- Browser-level checks are secondary.

### Commit Convention

Follow Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Scopes: `(shader)`, `(ui)`, `(core)`, `(deps)`, `(css)`, `(api)`
