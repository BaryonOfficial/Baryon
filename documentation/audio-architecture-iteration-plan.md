# Audio Architecture Iteration Plan

This note captures the current audio-architecture iteration plan for the worklet-primary analysis pipeline. It is a future/reference plan, not a description of fully completed behavior.

## Summary

Preserve the current particle/TSL path and iterate on the audio architecture with `worklet` as the primary pitch source, but make the worklet strictly analysis-only and decouple it from audible playback.

Immediate goals:

- eliminate audible lag/stutter during file playback
- eliminate speaker feedback/distortion when mic and file playback run together
- keep the worklet path viable for pitch extraction because it has better visual behavior than the current CPU fallback

## Key Changes

### 1. Split playback and analysis into separate audio subgraphs

Refactor the audio graph in `packages/visualizer/src/core/audio/audioSetup.js` so the worklet never sits on the audible path.

Target graph:

- file playback path:
  - decoded audio -> `THREE.Audio` / listener output -> destination
- file analysis path:
  - same file source tapped into analyser + worklet sidechain
- mic analysis path:
  - media stream source -> analyser + worklet sidechain
- mic monitoring path:
  - disabled by default; no mic signal routed to destination

### 2. Make mixed-source worklet analysis explicit and safe

Handle simultaneous file + mic input as two analysis sources feeding one pitch decision layer.

Defaults:

- keep analyser FFT/amplitude combination logic on CPU
- use one canonical pitch stream at a time
- prioritize file pitch during simultaneous file+mic usage
- still combine amplitudes/FFT for visual energy response

### 3. Stabilize and validate the worklet pitch path

Keep the Essentia worklet as the primary pitch provider, but tighten the runtime contract.

Implementation changes:

- ensure the worklet receives mono analysis input regardless of source channel count
- verify the ring-buffer write/read contract and only treat worklet pitch as valid when a fresh positive value is dequeued
- add timestamp/frame freshness tracking so stale worklet values are not reused silently
- expose source health in the audit/debug snapshot

Fallback behavior:

- if worklet is unavailable or stale beyond a short threshold, fall back to CPU pitch detection without preserving misleading old slots
- keep this fallback explicit in debug output

### 4. Rework CPU fallback semantics

The current CPU fallback is too weak/unstable to match worklet visuals. Improve it enough to serve as a safe degradation path, not a parity path.

Defaults:

- CPU fallback remains secondary
- when active, use a shorter-lived pitch history and stricter silence detection
- if no valid CPU pitch is present, clear slot history instead of decaying tiny ghost amplitudes
- keep FFT-derived amplitude coupling for slot amplitude semantics where possible

### 5. Add source-mode controls and diagnostics

Keep the current pitch-source selector and expand diagnostics enough to validate the graph.

Add or preserve:

- `Pitch Source`: `auto`, `worklet`, `yin`
- debug snapshot fields:
  - `requestedPitchSource`
  - `pitchSource`
  - `workletAvailable`
  - `workletFrameAge`
  - `fileActive`
  - `micActive`
  - `analysisSourceUsed`
  - `modeSlotCount`

## Test Plan

### Audible behavior

1. File playback alone is smooth, with no new stutter/lag introduced by analysis.
2. Mic enabled alone produces no speaker feedback by default.
3. File playback + mic enabled simultaneously produces no rapid static beat, feedback loop, or extra distortion.
4. Toggling mic on/off while file playback is active does not destabilize playback.

### Pitch-path behavior

1. `Pitch Source = worklet` produces fresh non-zero pitch frames under a steady tonal file.
2. `Pitch Source = worklet` under file+mic still uses the chosen canonical source deterministically.
3. `Pitch Source = yin` only activates when explicitly selected or when fallback is needed.
4. Forced unavailable sources clear slots cleanly instead of producing ghost patterns.

### Visual behavior

1. Worklet-primary mode retains the visually stronger cymatic patterns already observed.
2. File playback with mic active does not corrupt the modal slot stream.
3. Auto mode chooses the expected source and reports that choice correctly in the audit snapshot.

## Assumptions And Defaults

- `worklet` remains the primary pitch path because it gave better visual results than the current CPU path.
- Mic monitoring is out of scope for this iteration and should remain disabled by default.
- Simultaneous file+mic mode should prioritize stable pitch extraction over trying to treat both as equal pitch sources.
- CPU fallback is a reliability path, not the target parity implementation.
