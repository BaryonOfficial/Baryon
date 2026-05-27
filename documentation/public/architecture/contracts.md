# Baryon Contracts And Boundaries

This document records the contracts that should be treated as stable unless a task explicitly intends to change them.

The point is not “never refactor.” The point is to avoid accidental breakage at compatibility boundaries where Baryon has multiple hosts, persisted settings, and a shared visualization engine.

## The Primary Contract: `AudioFeatureFrame`

`AudioFeatureFrame` is the authoritative boundary between audio interpretation and visualization.

Practical meaning:

- the audio side is responsible for interpreting signal structure
- the render/runtime side is responsible for consuming that interpreted structure
- render code should not silently rebuild analysis semantics from raw audio state

Safe changes:

- reducing allocation or redundant work while preserving frame meaning
- splitting feature construction into clearer internal stages
- adding fields that downstream consumers can safely ignore

Current modal visibility semantics:

- `modalVisibilityEnergy` is an audio-owned feature-frame signal derived from
  rectangular water-cavity modal excitation, persistence, coherence, and active
  mode amplitudes
- low transient change must not suppress modal visibility; sustained ringing is
  valid cavity excitation
- renderers may use it to preserve local modal pressure-field visibility inside
  the spherical render hull, but must not use it as a full-frame fallback tint,
  density wash, spherical eigenmode switch, or independent mode promoter
- the current physical model is:
  `audio drive -> rectangular water-cavity modes -> modal pressure field -> spherical render hull`
- appearance descriptors are deterministic audio-derived fields. They may
  affect color, iridescence, and style, but must not drive modal promotion,
  core structure signals, visibility, density, or performance salience.

High-risk changes:

- changing the meaning of existing fields without a coordinated migration
- moving renderer-specific heuristics into the feature-frame contract
- papering over render/runtime bugs by mutating audio semantics ad hoc

When a bug appears near this seam, determine whether the issue is:

1. capture/input semantics
2. feature-frame construction
3. runtime consumption

Do not skip that diagnosis step.

### Spectral Light Color Contract

Spectral Light color is part of audio interpretation when it is implemented. It
must be produced before the render/runtime boundary and carried through the
render-facing modal color slots, not reconstructed from raw FFT bins inside the
renderer.

The intended shape is:

- modal promotion decides which frequencies become render-facing structure
- Spectral Light colors only those promoted modes
- renderers spatially mix modal colors using the same modal fields that define
  cymatic geometry
- a color value must not independently promote a mode
- the main render path must not add a global Spectral Light fallback tint

The current design brief lives in
[`documentation/internal/reference/spectral-light-color-mode-brief.md`](../../internal/reference/spectral-light-color-mode-brief.md).
The current engine-level contract is consolidated in
[`documentation/internal/reference/baryon-engine-whitepaper.tex`](../../internal/reference/baryon-engine-whitepaper.tex).

## Internal Optimization Boundary: Audio Engine Transport Frames

The worker-backed audio feature engine uses a transport frame built by:

- `packages/visualizer/src/utils/audio/audioFeatureEngine.js`

This transport frame is not the same thing as `AudioFeatureFrame`.

It exists to:

- enqueue analysis work
- move compact analyzer state across the worker boundary
- support internal scheduling and snapshot publication

Treat it as an internal optimization contract, not the public semantic contract for visualization behavior.

## Control Surface Contract

The authoritative control schema lives in:

- `packages/visualizer/src/controls/schema.js`

This schema defines:

- stable control keys
- defaults
- which controls apply to which visualization methods
- runtime destinations
- which controls are live vs debug-only

Important rule:

- if a value is persisted, transported, or consumed cross-host, the control key is effectively part of a compatibility surface

Changing a label is cheap. Changing a key is not.

## Persistence Contract

Persistence behavior lives in:

- `packages/visualizer/src/controls/persistence.js`
- `packages/app-shell/src/components/hooks/baryonControlsState.js`

Current persistence rules:

- only controls marked `live` are serialized
- debug-only controls are intentionally excluded from presets and auto-save
- deserialization starts from schema defaults
- unknown keys are dropped
- missing keys fall back to defaults
- a limited set of legacy fields is normalized forward

This means:

- adding a new live control is usually safe if its default is correct
- removing or renaming persisted keys requires explicit migration handling
- debug/audit settings should not leak into customer presets

## Visualization Method Contract

Visualization methods are defined in:

- `packages/visualizer/src/visualization/types.js`

Current canonical values:

- `raymarch`
- `cymatics-2d`

These values cross important boundaries:

- control applicability
- runtime creation
- diagnostics
- host output synchronization
- tests

Do not casually rename these string values without coordinating all consumers.

## Performance Profile Contract

The canonical performance-profile contract is publicly exported from:

- `packages/visualizer/src/render/outputPipeline.js`

Internally, pure render-profile policy may live separately from the renderer/WebGPU pipeline implementation. Treat the public `outputPipeline` import path as the compatibility boundary.

Current canonical internal values:

- `auto`
- `max-quality`

Compatibility alias still accepted:

- `none`

Current product meaning:

- `auto`: adaptive performance behavior is active
- `max-quality`: manual mode, meaning auto is off and explicit advanced settings should apply directly

Compatibility note:

- user-facing wording is “Performance Profile”
- compatibility fields and some transport surfaces still use `qualityPreset` or `renderQualityPreset`

Treat this as a naming boundary:

- the concept is performance profile
- the existing field names are compatibility vocabulary that still matter

Do not “clean up” those names across the codebase unless the task explicitly includes compatibility work.

## Output Transport Contract

Host stage/output synchronization uses a transport protocol with message classes such as:

- render snapshots
- audio feature frames
- sink readiness
- bootstrap / bootstrap acknowledgment
- rendered-frame acknowledgment

These messages coordinate:

- source-side state publication
- sink readiness
- bootstrap sequencing
- frame delivery and render acknowledgment

This protocol is a real contract even when it is internal to a host-specific integration.

High-risk changes include:

- renaming message types
- changing expected payload fields without dual-read compatibility
- changing bootstrap/ack ordering assumptions

## Host Output Config Contract

Host output configuration typically includes fields for:

- output enablement
- resolution selection
- performance profile
- renderer eligibility

That contract spans:

- renderer eligibility detection
- output controller configuration
- output diagnostics/status
- host integration tests

If UI wording changes, do not assume host-side config keys can change for free.

## Line-Feed vs Acoustic Mic Boundary

Input semantics are intentionally not uniform.

Baryon distinguishes between:

- line-feed / system / loopback-style input
- acoustic microphone input

That distinction affects:

- analysis-class choice
- whether some raw time-domain data is carried in transport frames
- expected visualization behavior under live input

Changes that “simplify” these paths into a single live-input mode are high risk unless the task explicitly intends a semantic merge.

### Line-feed program activity vs session intent vs render authority

Three quantities must stay separate on loopback / line-feed input:

| Quantity                   | Meaning                                                                                          | Typical owner                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Session render intent      | Go Live is on; the app keeps listening on BlackHole                                              | App status (`isLiveInputActive`) and render-loop scheduling                |
| Line-feed program activity | Upstream OS/program audio is actively driving the virtual device above its calibrated idle floor | `resolveLineFeedProgramActivity()` during `prepareAudioFeatureFrameInputs` |
| Render authority           | The composed frame may drive GPU field upload and reactive envelopes                             | `composeAudioFeatureFrame` + `renderAuthorityContract`                     |

Rules:

- `isLiveInputActive` may remain true while Apple Music (or another upstream player) is paused.
- Paused loopback is detected from sustained meter-idle signatures (~1.2 avg, low RMS), not from resonant memory or ad-hoc transport bands inside `modalExcitation`.
- High-Q retained ring energy may preserve display continuity during brief near-zero dropouts while program activity is still true, but it must not re-establish render authority after program idle.
- `last-live-cache` in the render loop may only reuse frames that still have render authority and `debug.lineFeedProgramActive !== false`.

File-mode transport pause remains owned by `shouldMuteFileTransportSource` (`status.isPlaying`) at prepare time.

## Host Boundary: Shared Engine vs Host-Specific Delivery

A recurring source of confusion is mixing these two concerns:

- shared-core analysis and rendering
- host-only output transport and native sink delivery

A performance or correctness issue in a host integration might still be a shared-core bug. A host-only fix should not be the default assumption.

Default order:

1. verify whether the shared engine is already wrong
2. only then patch host-specific transport or native delivery

## Rules For Safe Change

When touching a boundary, ask:

1. Is this a semantic contract or an internal implementation detail?
2. Does this value cross persistence, transport, or host boundaries?
3. Are tests already asserting this string/key/message shape?
4. Do I need a compatibility alias instead of a rename?

Prefer:

- canonical internal helpers
- normalization layers
- dual-read compatibility paths

Avoid:

- broad string renames
- schema-key churn
- transport payload shape drift without explicit migration
