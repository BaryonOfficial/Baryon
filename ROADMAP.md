# Baryon Roadmap

This roadmap is the public repo-level view of the current product plan. It reflects the active MVP PRD and should stay aligned with the desktop and web work happening in this monorepo.

## Product Direction

Baryon is building a real-time 3D cymatic visualizer with two connected product surfaces:

- The web app is a free discovery and conversion surface.
- The desktop app is the flagship paid product for VJs and producers who need live workflow integration.

The desktop direction is Electron, with the shared visualization engine and audio pipeline reused across hosts where that makes sense.

## Current Phase: MVP

Target: ship the first desktop release in roughly 1 to 2 months from kickoff.

### Web

- Keep the web experience visually strong and easy to try with mic or file input.
- Use the web app as the upgrade funnel for users who need professional output workflows.
- Preserve the current shared engine architecture so improvements to the renderer benefit both hosts.

### Desktop

- Build the licensed Electron desktop app as the flagship product surface.
- Support live audio input from system devices, microphones, and virtual audio cable workflows.
- Render the volumetric WebGPU cymatic visualization at flagship quality.
- Keep on-screen playback available with minimal setup.

## Active Engineering Workstream: AudioFeatureEngine Performance

Current performance work is intentionally split into two phases so Baryon can stay a real-time cymatic visualizer while still leaving room for deeper desktop acceleration later.

### Phase 1: Shared-Core Structural Lane Reduction

- Reduce `AudioFeatureEngine` structural-lane cost in shared packages first.
- Keep web and desktop on the same core audio-analysis path while this work lands.
- Preserve cymatic semantics: modal topology, harmonic structure, beat behavior, and line-feed vs acoustic-mic handling should remain materially equivalent.
- Prioritize reducing structural work, projection cost, and allocation churn before introducing host-specific transport changes.

### Phase 2: Desktop-Specific Acceleration

- Re-measure after the shared-core pass and only then target what remains desktop-specific.
- Candidate follow-up work includes lower-overhead transport, `AudioWorklet`, `SharedArrayBuffer`, and Electron-only output or capture-path optimization.
- Desktop-specific work should build on the shared-core improvements, not replace them.

## MVP Deliverables

### P0

- Electron desktop shell ready for production feature work
- Live audio input device enumeration and selection
- WebGPU volumetric cymatic renderer in the desktop host
- Syphon output on macOS
- Spout output on Windows
- License key validation and purchase flow
- macOS and Windows distribution

### P1

- OSC input on a configurable port for parameter automation
- System audio loopback capture improvements
- File playback and microphone-first desktop flows where still missing
- Auto-update support
- Trial mode and license transfer/deactivation flows

### P2

- Linux Debian package distribution
- Linux visualization-only support without Syphon/Spout parity

## Platform Priorities

- macOS: first-class desktop target with Syphon output
- Windows: first-class desktop target with Spout output
- Linux: best-effort support for visualization and audio input only

## Out Of Scope For This Phase

- VST or AU plugin builds
- Native TouchDesigner or Resolume plugins
- NDI or other network transport
- MIDI output
- Video export or recording
- Preset marketplace or sharing
- Usage-based billing

## After MVP

These are reasonable next candidates after the initial desktop launch, but they are not committed for the current phase:

- OSC output for external reactive control workflows
- MIDI output
- NDI for multi-machine setups
- Preset save/load and sharing
- Video export or screen recording
- Investigation into a Linux-native output bridge story
