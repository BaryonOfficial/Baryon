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

## Mic Settings

Controls for live-input analysis and browser microphone processing.

| Label               | Description                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Live Input Mode** | Choose how unknown live devices should be analyzed. `Auto` uses heuristics, `Line Feed` uses the file-style path, and `Acoustic Mic` uses the mic-specific path. |
| **Mic Intent**      | Choose how acoustic mic input should be interpreted. `Ambient` is forgiving for rooms and instruments; `Vocal` emphasizes singing and lead pitch. |
| **Echo Cancel**     | Suppress speaker bleed and room echo from mic input. Useful with speakers, but it may color the audio spectrum.               |
| **Noise Suppress**  | Filter out steady background noise before analysis. Useful in noisy rooms, but it can soften quieter harmonics.               |
| **Auto Gain**       | Automatically normalize mic volume. Convenient for speech, but it flattens dynamics for visualization.                        |

---

## Mode

Controls for the modal family, color mode, rotation mode, performance profile, and output mode.

| Label                 | Description                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Boundary**          | Choose whether the modal family behaves like a reflective boundary (`Neumann`) or a fixed node at the boundary (`Dirichlet`).             |
| **Color Mode**        | `Static` uses the chosen colors. `Spectral` colors promoted cymatic modes from the audio spectrum.                                        |
| **Rotation Mode**     | `Audio` rotates the orb with the music, `Manual` uses Manual Rotation, and `Off` keeps the scene stationary.                              |
| **Performance Profile** | `Auto` uses the app-chosen FPS budget, `Custom` adapts toward Custom Target FPS, and `Max Quality` keeps full quality at display-rate cadence. |
| **Custom Target FPS** | Frame-rate target used when Performance Profile is `Custom`.                                                                              |
| **Output Mode**       | `Transparent` composites over other content. `Opaque` renders with its own solid background.                                              |
| **Visualizer**        | Visualization method. The current product renderer is the single 3D Volume raymarch path.                                                 |
| **Lock Camera**       | Lock the camera so orbit drag cannot accidentally move the view.                                                                          |

---

## Shape

Controls for the raymarched modal volume.

| Label              | Description                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Node Threshold** | How sharp the glowing ring structures appear — lower values create crisper, more defined rings.                  |
| **Density**        | How thick and bright the overall volume glow appears — raise for a bolder, denser orb.                           |
| **Absorption**     | Depth contrast inside the orb — raise for crisper internal layers and less haze.                                 |
| **Opacity**        | How solid the orb appears — raise for a stronger presence, especially when compositing over video.               |
| **Steps**          | Rendering quality versus speed — higher values look smoother but may reduce frame rate on slower GPUs.           |

---

## Color

Controls for the orb color and Spectral Light transfer.

| Label           | Description                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Volume**      | Main glow color of the orb interior.                                                                                   |
| **Contour**     | Color of the sharpest ring edges and contour highlights.                                                               |
| **Color Mix**   | Strength of Spectral Light coloring when Color Mode is `Spectral`.                                                     |
| **Sheen**       | Adds a holographic sheen to the orb's surface edges.                                                                   |
| **Sheen Color** | How far the sheen color shifts toward cool blue-green tones.                                                           |
| **Sheen Edge**  | How tightly the sheen stays to the very edge — higher values confine it to a thinner rim.                              |

---

## Logo

Idle-state overlay controls.

| Label              | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| **Logo Intensity** | Brightness of the idle logo shown when no audio is playing.     |
| **Logo Size**      | Size of the idle logo overlay shown when no audio is playing.   |

---

## Motion

Controls for scene movement and audio reactivity.

| Label               | Description                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Manual Rotation** | Spin speed in Manual rotation mode — negative values reverse direction.                                                |
| **Reactivity**      | How strongly the visuals respond to the audio — raise for more dramatic reactions.                                     |
| **Motion Scale**    | Scales the auto-calibrated rotation in Audio mode. It has no effect in Manual rotation mode.                           |

---

## Display

Controls for bloom, background, output color, and fine-grained glow shaping.

| Label              | Description                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Glow**           | Toggle the glow or halo effect around bright parts of the orb.                                               |
| **Glow Strength**  | How bright the glow halo is.                                                                                 |
| **Glow Radius**    | How far the glow spreads from bright areas.                                                                  |
| **Glow Threshold** | Minimum brightness before a region contributes to glow — raise to limit it to the brightest highlights.      |
| **Background**     | Backdrop color shown behind the orb in transparent output mode.                                              |
| **Output Color**   | Background fill color used in Opaque output mode.                                                           |
| **Glow Response**  | Makes the glow smaller and more stable by trimming how easily bloom reacts during crowded frames.            |
| **Rim Glow**       | Pushes more brightness toward the outer rim before bloom is applied.                                         |
| **Rim Compression** | Tames sharp edge spikes before they reach the bloom pass.                                                   |

---

## Inline Stage Controls

These controls are defined in the shared control schema but may be rendered inline instead of inside a collapsible folder.

| Label               | Description                                |
| ------------------- | ------------------------------------------ |
| **Performance HUD** | Shows FPS and render resolution on screen. |

---

## Diagnostics

Diagnostic controls help isolate render, audio, and analysis behavior. Debug-only controls require devtools (`DEVTOOLS_ENABLED`).

| Label                  | Description                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **TRAA**               | Toggle temporal anti-aliasing for diagnostics when isolating render latency, shimmer, or post-process cost.                       |
| **SMAA**               | Toggle final screen-space anti-aliasing on or off for visual A/B checks.                                                          |
| **Capture Debug Data** | Record per-frame debug data for the active analysis and renderer.                                                                 |
| **Freeze Pattern**     | Hold the current modal pattern in place instead of updating it from live audio.                                                    |
| **Force WebGL2**       | Restart the renderer on the WebGL2 fallback path for compatibility testing. This remounts the canvas.                             |
| **Low-load Playback**  | Reduce render overhead during playback diagnostics so you can inspect behavior on slower systems or heavier songs.                |
| **Cavity Geometry**    | Choose which cavity geometry to request for diagnostics. Spherical requests still fall back to the rectangular basis today.        |
| **Inject Tone**        | Replace live audio with a synthetic test tone so you can inspect a known, repeatable input.                                       |
| **Tone Hz**            | Frequency of the injected test tone in Hz. Low values inspect renderable patterns; high values exercise bandwidth-limit diagnostics. |
| **Tone Signal**        | Choose whether the injected test signal is a pure sine or an explicit harmonic series.                                            |
| **Tone Amp**           | Amplitude of the injected test tone — lower values produce subtler pattern excitation.                                            |
| **Log Frames**         | Write a debug snapshot to the browser console every N frames. Use 1 for every frame.                                              |

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
