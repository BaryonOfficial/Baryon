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
  visualizer/ @baryon/visualizer — Core engine (Three.js, GPGPU, audio, shaders)
  ui/         @baryon/ui         — cn() utility + shared Tailwind base
  config/     @baryon/config     — Shared Vite base config (createBaseViteConfig)
```

`apps/web` and `apps/desktop` import the visualization engine via `@baryon/visualizer`. Static assets (`public/lib/`, `public/glb/`) are duplicated in each app's `public/` since they are fetched at runtime via URL.

## Architecture Overview

Baryon is a 3D audio visualizer built with React + Three.js. Audio analysis drives a GPU particle simulation (GPGPU) that renders a cymatics-style visualization.

### Data Flow

```
Audio Input (file / mic)
  → Web Audio API + AudioWorklet (Essentia.js pitch/RMS analysis)
  → Ring buffer (SharedArrayBuffer)
  → GPGPU compute pipeline (Four render targets)
  → Particle shader → Three.js renderer → Post-processing (bloom)
```

### GPGPU Compute Pipeline (`packages/visualizer/src/core/gpgpuSetup.js`)

Uses `GPUComputationRenderer` (Three.js addon) with four chained compute variables:

1. **`uAudioData`** — Reads FFT frequency data and Essentia pitch data; outputs audio texture
2. **`uScalarField`** — Computes a 3D scalar field from audio data and base geometry positions
3. **`uZeroPoints`** — Finds zero-crossing points in the scalar field (cymatics node positions)
4. **`uParticles`** — Moves particles toward zero-point positions using flow fields; uses simplex noise

Shaders live in `packages/visualizer/src/three/shaders/gpgpu/`. Each compute variable depends on the previous one.

### Audio Pipeline (`packages/visualizer/src/core/audio/audioSetup.js`)

- `audioObject` is a module-level singleton holding all Web Audio nodes
- Essentia.js (WASM) runs in an AudioWorklet (`public/lib/`) for real-time pitch/RMS extraction
- Audio data is passed to the GPU each frame via `processAudioData()`
- Supports both file playback and live microphone input
- **Requires HTTPS or localhost** for `SharedArrayBuffer` and microphone access

### React Layer

- `apps/web/src/components/ThreeScene.jsx` — Root component; owns UI state and wires together the Three.js hook and audio logic
- `packages/visualizer/src/three/scene/useThreeScene.js` — `useEffect` hook that initializes and runs the entire Three.js scene (scene, camera, renderer, GPGPU, animation loop)
- `apps/web/src/components/hooks/useAudioLogic.jsx` — Handles file upload, play/pause, stop, mic toggle, and device selection
- `apps/web/src/components/AudioControls.jsx` — UI overlay for audio controls

### Key Configuration

- `apps/web/vite.config.js`: Requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers in dev (needed for `SharedArrayBuffer`)
- Shared Vite plugins (react-swc, GLSL, top-level-await, js-as-JSX) are in `packages/config/vite.base.js` via `createBaseViteConfig()`
- Production `console` and `debugger` statements are dropped by esbuild
- GLSL files are imported directly via `vite-plugin-glsl` (must be present in any consuming app's Vite config)
- Path alias `@` maps to `./src` in each app
- All `.js` files in `src/` are treated as JSX via the custom Vite plugin in `@baryon/config`

### Commit Convention

Follow Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Scopes: `(shader)`, `(ui)`, `(core)`, `(deps)`, `(css)`, `(api)`
