# Baryon Control Panel Reference

The Baryon GUI (top-right corner) lets you shape the visualizer in real time. Hover over any control in the panel to see its tooltip. This document provides the full reference for every control, organized by folder.

---

## Audio Input Profiles

The mic profile selector next to the mic button exposes two analysis presets:

| Profile     | Description                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| **Voice**   | Speech and singing. Tracks a lead vocal pitch and uses harmonics as texture.                             |
| **Ambient** | Crowds, rooms, parties, and mixed music. Represents multiple simultaneous sources instead of one driver. |

The mic path auto-calibrates when the microphone starts and whenever you switch profiles.

---

## Effects

Controls for post-processing and idle-state appearance.

| Label              | Description                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled**        | Toggle the bloom (glow) post-processing effect on or off.                                                                             |
| **Strength**       | How bright and intense the bloom glow is — higher values create a more pronounced halo around bright particles.                       |
| **Radius**         | How far the bloom glow spreads outward from bright areas — higher values create a softer, wider glow.                                 |
| **Threshold**      | Minimum brightness required for a pixel to contribute to the bloom effect — raise this to limit glow to only the brightest particles. |
| **Logo Intensity** | Strength of the logo particle attraction when no audio is playing — higher values make the idle logo formation more defined.          |
| **Logo Size**      | Scale of the logo formation that particles drift toward when idle — adjust to match the visual weight of your logo.                   |

---

## Color

Controls for the scene and particle color palette.

| Label              | Description                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Background**     | Scene background color — use deep black for the most contrast with glowing particles.                                                                                                      |
| **Program Output** | `Transparent` keeps the render alpha so Baryon can sit over video, graphics, or another scene. `Opaque` fills the frame with a solid background for standalone fullscreen or stage output. |
| **Program Fill**   | Background color used only when Program Output is `Opaque`.                                                                                                                                |
| **Volume**         | Color of particles inside the resonant volume — these particles fill the interior of the cymatics pattern.                                                                                 |
| **Surface**        | Color of particles that sit on the nodal surface boundaries of the cymatics structure.                                                                                                     |
| **Color Mode**     | `Static` uses the Volume and Surface colors. `Spectral` colors promoted cymatic modes from the audio spectrum and mixes those colors through the modal field.                              |
| **Color Mix**      | Strength of Spectral Light coloring when Color Mode is `Spectral`. At 0 the render uses the static colors; higher values tint only where promoted modal color slots contribute.            |

---

## Particles

High-level motion controls.

| Label        | Description                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Speed**    | Overall speed multiplier for particle movement — higher values make particles respond faster to the field but can feel chaotic. |
| **Rotation** | Speed and direction of the particle cloud's Y-axis rotation — negative values reverse direction, zero disables rotation.        |

---

## Granular

Fine-grained controls over how the cymatics simulation behaves. These interact with each other — see the notes below the table.

| Label              | Description                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Flow Strength**  | Strength of the turbulent 3D noise field that adds organic, swirling motion to particles — combine with Flow Mix to blend with structured cymatics.    |
| **Flow Frequency** | Spatial frequency of the noise flow field — lower values create broad, slow swirls; higher values produce fine, tight eddies.                          |
| **Node Threshold** | How tightly the field must approach zero for a point to be considered a nodal target — lower values create sharper, more defined structures.           |
| **Flow Mix**       | Blend between structured cymatics (0) and freeform noise-field motion (1) — mid values produce organic formations that still follow the audio pattern. |
| **Attraction**     | How strongly particles are pulled toward their target nodal positions — higher values snap particles into sharp formations faster.                     |
| **Damping**        | How quickly particle velocity decays each frame — higher values slow particles more aggressively, reducing overshooting and jitter.                    |
| **Center Inner**   | Inner radius of the dead zone at the origin — particles inside this radius are pushed outward to prevent a bright central clump.                       |
| **Center Outer**   | Outer boundary of the center-suppression gradient — particles between inner and outer radius experience a graduated push away from center.             |
| **Structure Min**  | Lower field-potential cutoff — particles targeting nodes below this threshold are excluded, trimming the weakest/noisiest parts of the pattern.        |
| **Structure Max**  | Upper field-potential cutoff — particles targeting nodes above this threshold are excluded, removing the densest interior regions.                     |

### Granular interaction notes

- **Flow Mix** is the main blend lever. At 0 the pattern is purely cymatics-driven; at 1 it is purely noise-driven. Flow Strength and Flow Frequency only take effect above 0.
- **Center Inner / Center Outer** work as a gradient pair. Keep Inner ≤ Outer. Widening the gap between them softens the suppression falloff.
- **Structure Min / Structure Max** together act as a band-pass filter on the scalar field. Narrowing the band concentrates particles on a thin shell of the pattern; widening it fills in more of the volume.
- **Attraction** and **Damping** are counteracting forces. High attraction + low damping produces fast, springy particles. Low attraction + high damping produces slow, viscous drift.

---

## Aesthetics

| Label       | Description                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Surface** | Toggle particles that sit on the outer nodal surface boundary — disabling this shows only the interior volume particles. |

---

## Audit _(dev-only)_

These controls are only visible when devtools are enabled (`DEVTOOLS_ENABLED`). They are for diagnosing the audio and particle pipelines — they do not affect the final render quality.

| Label                 | Description                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Enabled**           | Enable frame-by-frame debug logging for the audio and particle pipeline.                                                                         |
| **Freeze Slots**      | Lock the current modal frequency slots so they stop updating from live audio — useful for inspecting a specific cymatics pattern.                |
| **Low-load Playback** | Reduce renderer overhead during playback diagnostics by forcing a lower pixel ratio and skipping non-essential audit work while audio is active. |
| **Inject Tone**       | Replace live audio input with a synthetic test tone — use with Tone Hz and Tone Amp to diagnose specific frequency responses.                    |
| **Tone Hz**           | Frequency in Hz of the injected test tone — try values like 110, 220, 440 to see how different pitches shape the cymatics pattern.               |
| **Tone Amp**          | Amplitude (volume) of the injected test tone — lower values produce subtler pattern excitation.                                                  |
| **Log Frames**        | Log a debug snapshot every N frames to the browser console — set to 1 to log every frame, higher to reduce noise.                                |

---

## Presets

The **Presets** folder lets you save and recall named snapshots of all current control values.

| Action                | Description                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Name** field        | Type a name for the preset you want to save.                                                                     |
| **Save**              | Save the current controls under the typed name. Overwrites any existing preset with the same name.               |
| **Load** dropdown     | Select a saved preset to restore its values. Modifying any control after loading clears the selection indicator. |
| **Reset to defaults** | Restore all controls to their factory defaults.                                                                  |
| **Delete Selected**   | Delete the preset currently shown in the Load dropdown (controls are left unchanged).                            |

Settings are also auto-saved to `localStorage` as you adjust controls (debounced 500 ms), so your last session's values are restored on next load.
