# Field-Driven Cymatic Particle Simulation Plan

This note captures the approved future refactor plan for making the current particle system more credible as a cymatic-style standing-wave visualization. It is a future/refactor reference, not a description of current runtime behavior.

## Summary

Keep:
- CPU audio analysis and mode resolution
- the current 3D standing-wave / Chladni scalar field as the modal backbone
- the existing overall render look and GUI structure unless a control becomes invalid

Change:
- particles stop behaving like beads snapping to stored zero-points
- particles become density probes moving through a nodal potential derived from the scalar field
- center singularity/clumping is prevented by the field interpretation itself, not by ad hoc resets

## Key Changes

### 1. Replace binary zero-point selection with a nodal potential
In `packages/visualizer/src/core/tslSetup.js`, remove the current `abs(field) < threshold` target model as the primary driver.

Add a compute stage or repurpose the zero-point stage to write continuous per-sample data:
- `fieldAbs = abs(F)`
- `gradient estimate`
- `nodeBandWeight`
- `structureWeight`
- `potential = nodeBandWeight * structureWeight`
- `groupTag` for surface vs volume classification

Implementation defaults:
- `nodeBandWeight = 1 - smoothstep(0, uThreshold, fieldAbs)`
- `structureWeight` comes from `length(grad(F))`, normalized with two fixed thresholds
- apply a small center suppression term so trivial zeros near `r = 0` do not dominate
- preserve surface/volume tagging, but make it secondary to potential strength

This stage should no longer store a persistent "last valid target" position as the main output.

### 2. Move particles by local field response, not stored target chasing
Refactor the particle pass in `packages/visualizer/src/core/tslSetup.js` to use local forces.

Per particle:
- sample the nodal potential around the current position
- estimate a direction toward stronger nodal-manifold occupancy
- add mild secondary flow/noise only as a visual perturbation
- add damping each frame
- update velocity and then position

Implementation defaults:
- introduce a `velocityBuffer` alongside `particlesBuffer`
- compute a finite-difference gradient from nearby field/potential samples using a small epsilon relative to `uRadius`
- attraction term is the primary force during active audio
- flow term is attenuated when attraction is strong and should never dominate convergence
- idle/logo mode bypasses field attraction and uses a separate calm logo-settling path

This removes the current binary `target = zeroPoint.xyz` behavior as the main movement model.

### 3. Add anti-clump behavior
Prevent particle pileups, especially at the center or along trivial singularities.

Use a lightweight first-pass approach:
- add radial center suppression in the nodal potential
- add a density penalty term based on a coarse occupancy approximation or local radial penalty
- clamp attraction when too many particles would collapse into the same small region

Chosen default for v1:
- implement center suppression plus potential weighting first
- do not add a full neighbor search or true spatial hash in the first refactor
- if needed later, add a coarse voxel occupancy buffer as a follow-up

### 4. Preserve visual continuity without retained stale targets
Remove the current reliance on retained zero-point positions to preserve morphing.

Replace it with:
- velocity damping
- gradual force evolution as mode slots change
- short-lived temporal smoothing in the force/potential response if needed

Implementation default:
- keep CPU pitch-history smoothing before mode resolution
- do not keep long-lived stored zero-point targets across incompatible fields
- on mode change, let continuity come from particle inertia and damping instead of cached node positions

### 5. Update rendering to reduce density blowout
Keep the existing holographic style, but make dense regions less visually explosive.

In the particle material path:
- reduce raw additive blowout for over-dense clusters
- optionally attenuate alpha or brightness by a density/proximity-derived factor
- preserve surface vs volume color separation

Implementation default:
- keep additive blending
- add a simple density attenuation factor if available from the particle/group data
- do not redesign the look; only reduce artifact amplification

## Public Interfaces / Runtime Controls

Minimal interface changes:
- keep the existing `tickTSL(renderer, tslState, featureFrame, time, deltaTime)` entrypoint
- keep `buildAudioFeatureFrame()` unchanged at the public seam
- extend internal TSL state with:
  - `velocityBuffer`
  - nodal potential buffer or enriched scalar-field buffer
  - new uniforms for force tuning and center suppression

Add or repurpose runtime controls:
- `Node Threshold` remains
- add `Center Suppression`
- add `Attraction Strength`
- add `Damping`
- add `Flow Mix`
- optionally add `Structure Threshold` for gradient gating

## Test Plan

### Core behavior
1. Steady tonal input produces a readable volumetric nodal structure without a dominant bright center.
2. Pitch changes cause continuous morphing of occupied nodal regions rather than snapping or sphere-wide whitening.
3. Silence returns particles to a calm logo state without jitter or heartbeat-like pulsing.

### Artifact prevention
1. No persistent center hotspot under stable audio.
2. No full-sphere collapse when field magnitude is near zero or no modes are active.
3. Flow noise never dominates attraction under stable audio; particles should settle into distributed manifolds.

### Visual continuity
1. Mode changes preserve continuity through inertia/damping, not stale target retention.
2. Surface and volume particles remain distinguishable.
3. Dense areas remain readable and do not blow out enough to hide the structure.

## Assumptions And Defaults

- Keep the current 3D modal/Chladni field; do not replace it with a full acoustic solver.
- Particles represent suspended matter/density probes, not literal phonons.
- The first refactor should prioritize credible structure and artifact reduction over strict physical simulation.
- Center suppression is an allowed interpretation aid because the origin is a trivial zero in the current field and visually pathological.
- A lightweight anti-clump approach is sufficient for v1; full neighbor-aware repulsion is deferred unless needed after the field-driven motion refactor.
