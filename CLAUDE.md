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

There are no tests. When verifying changes, use `pnpm lint` and `pnpm build` from `apps/web`.

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

Baryon is a 3D audio visualizer built with React Three Fiber + Three.js WebGPU. Audio analysis drives a GPU compute pipeline using Three.js TSL (Three Shading Language) that renders a cymatics-style particle visualization. **Requires WebGPU** — Chrome/Edge only, no WebGL fallback.

### Data Flow

```
Audio Input (file / mic)
  → Web Audio API + AudioAnalyser (FFT)
  → findFFTPeaks() — spectral peak picking → pitch buffer (GPU storage)
  → TSL compute pipeline (4 sequential compute stages)
  → PointsNodeMaterial (TSL colorNode + sizeNode) → RenderPipeline
  → TSL bloom node → WebGPURenderer
```

### TSL Compute Pipeline (`packages/visualizer/src/core/tslSetup.js`)

Uses Three.js TSL compute nodes with GPU storage buffers (`instancedArray()`). Four chained stages:

1. **audioData** — Converts FFT peak frequencies to Chladni mode numbers via secant method; outputs pitch buffer
2. **scalarField** — Computes 3D Chladni standing-wave scalar field from mode numbers + base geometry positions
3. **zeroPoints** — Finds zero-crossing points in the scalar field (cymatics node positions)
4. **particles** — Moves particles toward zero-point targets using MaterialX 3D Perlin noise flow field

Key functions exported from `@baryon/visualizer`:
- `setupTSL(baseGeometry, renderer, parameters, baseGeometry2, audioConfig)` — initializes pipeline
- `tickTSL(tsl, time, deltaTime, audioState)` — per-frame compute update
- `disposeTSL(tsl)` — cleanup

### Audio Pipeline (`packages/visualizer/src/core/audio/audioSetup.js`)

- `createAudioContext()` factory — returns an audio instance (not a singleton)
- `getDefaultAudioContext()` — returns shared singleton for backward compat
- Supports file playback (`THREE.Audio` + `AudioAnalyser`) and mic input (`getUserMedia` + second `AudioAnalyser`)
- `audio.getState()` — returns live state object used by `createTimeHandler(getState)`
- `findFFTPeaks(frequencyData, sampleRate, N)` — spectral peak detection (`packages/visualizer/src/utils/fftPeaks.js`); replaces Essentia.js for pitch extraction

### React Layer

- `apps/web/src/components/ThreeScene.jsx` — Root component; creates R3F `<Canvas>` with `WebGPURenderer`, checks WebGPU support (rejects mobile/Firefox/Safari), renders `<BaryonScene>` + UI overlays
- `apps/web/src/components/BaryonScene.jsx` — R3F scene component; owns the TSL pipeline lifecycle, Tweakpane GUI, model loading, and audio wiring; uses `useFrame` with priority 1 (takes over rendering from R3F auto-render)
- `apps/web/src/context/AudioProvider.jsx` — owns all audio state, wraps ThreeScene
- `apps/web/src/components/hooks/useAudioLogic.jsx` — file upload, play/pause, stop, mic toggle
- `apps/web/src/components/AudioControls.jsx` — UI overlay, reads from `useAudio()`

### Key Configuration

- **WebGPU**: `ThreeScene.jsx` creates `WebGPURenderer` via R3F's `gl` prop: `await renderer.init()` required before use
- **Tailwind v4**: Uses `@tailwindcss/vite` plugin, `@import "tailwindcss"` in `index.css`, `@theme` blocks; no `postcss.config.js`; `tailwind-merge` v3
- `apps/web/vite.config.js`: Requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers (needed for `SharedArrayBuffer`)
- Shared Vite plugins (react-swc, GLSL, top-level-await, js-as-JSX) are in `packages/config/vite.base.js` via `createBaseViteConfig()`
- All `.js` files in `src/` are treated as JSX
- Path alias `@` maps to `./src` in each app
- All magic numbers in `packages/visualizer/src/defaults.js`

### Commit Convention

Follow Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Scopes: `(shader)`, `(ui)`, `(core)`, `(deps)`, `(css)`, `(api)`
