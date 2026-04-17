# Baryon Architecture Map

This document is a public engineering map of the Baryon monorepo. It is meant to help contributors find the right seam before changing behavior without documenting private host-product details.

It is not a full code tour. It is a high-signal map of the shared runtime, ownership boundaries, and the files that usually matter first.

## System Shape

The main shared pipeline is:

```text
audio source
  -> Web Audio analyzers / live-input analysis
  -> CPU-side feature building
  -> AudioFeatureFrame
  -> visualization runtime
  -> render/output pipeline
  -> host-specific presentation
```

The most important rule is that Baryon is not a generic audio-reactive renderer. The audio side interprets structure first, and the render side consumes that structure.

## Package Ownership

### `packages/visualizer`

Owns the shared engine and most domain semantics:

- audio analysis and feature extraction
- `AudioFeatureFrame` construction
- control schema/defaults/runtime application
- visualization runtime factories
- render quality/profile policy and output pipeline composition
- raymarch and `cymatics-2d` runtime implementations

Start here when a change affects shared visualization behavior across hosts.

Important files:

- `packages/visualizer/src/utils/audio/buildFeatureFrame.js`
- `packages/visualizer/src/utils/audio/audioFeatureEngine.js`
- `packages/visualizer/src/core/audio/`
- `packages/visualizer/src/controls/schema.js`
- `packages/visualizer/src/controls/runtime.js`
- `packages/visualizer/src/render/outputPipeline.js`
- `packages/visualizer/src/visualization/runtimeFactory.js`
- `packages/visualizer/src/core/raymarch/`

### `packages/app-shell`

Owns shared React/runtime orchestration around the visualizer:

- control state lifecycle
- render-loop orchestration
- runtime diagnostics and performance HUD state
- scene mounting and visualization host components
- shared output-surface componentry used by host integrations

Start here when the underlying visualizer is fine but state flow, render cadence, or host integration looks wrong.

Important files:

- `packages/app-shell/src/components/hooks/baryonVisualizerRenderLoop.js`
- `packages/app-shell/src/components/hooks/useBaryonVisualizer.js`
- `packages/app-shell/src/components/hooks/baryonControlsState.js`
- `packages/app-shell/src/components/ThreeScene.jsx`
- `packages/app-shell/src/components/OutputStageSurface.jsx`

### `apps/web`

Owns the browser product shell:

- web app composition
- browser-specific smoke and unit tests
- web-only UX and conversion-surface behavior

Start here when the issue is web-shell-specific rather than shared-engine behavior.

### Host-specific shells

Baryon also has host-specific integration layers around the shared engine.

This public map intentionally does not document those product-specific shells in detail. The important public rule is that host integrations should wrap the shared visualizer rather than fork its semantics.

## The Main Shared Seam

The highest-value seam in the repo is:

```text
audio analysis -> AudioFeatureFrame -> visualization runtime
```

That seam exists so that:

- audio interpretation stays renderer-agnostic
- render bugs can be debugged without rewriting analysis semantics
- new runtimes can consume the same authoritative feature structure

If a render symptom appears, do not assume the render side should reinterpret the audio input. First determine whether the problem is in:

1. audio capture / live-input classification
2. feature extraction / `AudioFeatureFrame`
3. runtime/render consumption
4. host-specific output/presentation

## Core Runtime Lanes

### Audio ingestion and live-input semantics

Audio capture and live-input semantics live under:

- `packages/visualizer/src/core/audio/`

This layer owns:

- analyzer setup
- device/input classification
- live-input analysis policy
- the distinction between line-feed/system-style input and acoustic mic input

Treat those input classes as intentionally distinct unless the task explicitly changes semantics.

### Feature construction

Feature construction lives under:

- `packages/visualizer/src/utils/audio/`

Two related but different artifacts exist here:

- `AudioFeatureFrame`: the authoritative render-facing structure
- transport frames for the worker-backed audio feature engine

The transport frame is an optimization boundary for internal processing. It is not the same contract as `AudioFeatureFrame`.

### Render-loop orchestration

The main orchestrator is:

- `packages/app-shell/src/components/hooks/baryonVisualizerRenderLoop.js`

This layer:

- samples analyzer state
- prepares heavy-analysis inputs
- builds or reuses feature frames
- drives adaptive raymarch behavior
- records runtime diagnostics
- publishes render/runtime snapshots used by host shells

If performance, frame pacing, or active-vs-idle behavior looks wrong, this file is usually on the critical path.

### Visualization runtime

Visualization method selection lives under:

- `packages/visualizer/src/visualization/`

Current supported methods:

- `raymarch`
- `cymatics-2d`

The default and flagship path is `raymarch`.

### Output/render profile resolution

Render profile policy is separated from renderer composition, but the public contract is still exported from:

- `packages/visualizer/src/render/outputPipeline.js`

This layer owns:

- canonical performance-profile normalization and render-quality policy
- render-scale / TRAA / bloom profile resolution
- transparent vs opaque output composition and renderer pipeline setup

If a change affects “Performance Profile” semantics, this file is part of the contract surface.

## Host Output Branch

Host/output integration is a separate branch after the shared runtime:

```text
source render/runtime
  -> source transport messages
  -> output coordinator
  -> sink surface
  -> host-specific presentation
```

The important split is:

- shared visualizer behavior still comes from the same core engine
- host integration adds a synchronization and delivery layer around that engine

Do not mix host-specific transport concerns back into shared audio interpretation unless the real bug is at the shared seam.

## State Surfaces That Matter

### Control schema

The authoritative control surface is defined in:

- `packages/visualizer/src/controls/schema.js`

This is the source of truth for:

- keys
- defaults
- labels
- runtime paths
- method applicability
- live vs debug-only persistence eligibility

### Persisted control state

Persistence behavior lives in:

- `packages/visualizer/src/controls/persistence.js`
- `packages/app-shell/src/components/hooks/baryonControlsState.js`

Only live controls are serialized into presets and saved settings. Debug-only controls are intentionally excluded.

### Runtime diagnostics

Diagnostics are assembled across:

- `packages/app-shell/src/components/hooks/baryonVisualizerRuntimeState.js`
- `packages/app-shell/src/components/hooks/baryonVisualizerRenderLoop.js`
- `packages/app-shell/src/components/PerformanceHud.jsx`

This is the first place to look when a report is really about pacing, adaptive rendering, or method/profile state.

## Common Entry Points By Symptom

If the issue is:

- wrong live-input behavior: start in `packages/visualizer/src/core/audio/`
- patterns look musically wrong: start in `packages/visualizer/src/utils/audio/buildFeatureFrame.js`
- render looks wrong but analysis seems plausible: start in `packages/visualizer/src/visualization/` and `packages/visualizer/src/core/raymarch/`
- manual controls do not stick or load: start in `packages/visualizer/src/controls/` and `packages/app-shell/src/components/hooks/baryonControlsState.js`
- source/output integration diverges from the main preview: start at the host integration layer and verify the shared engine is still correct before patching transport or output delivery
- performance collapses only during active visuals: start in `packages/app-shell/src/components/hooks/baryonVisualizerRenderLoop.js` and `packages/visualizer/src/core/raymarch/`

## Change Discipline

Before changing a file, ask:

1. Is this shared-engine behavior or host-shell behavior?
2. Am I changing semantics, transport, or presentation?
3. Is the real contract here `AudioFeatureFrame`, control schema state, or output transport?
4. Will this change accidentally collapse an intentional distinction, especially line-feed vs acoustic mic or shared-core vs host-output behavior?

If those answers are still unclear, gather more context before editing.
