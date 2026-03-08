// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { RenderPipeline } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { Pane } from "tweakpane";
import { getDefaultAudioContext } from "@baryon/visualizer/audio";
import { createTimeHandler, setupLoaders, setupTSL, tickTSL, disposeTSL, DEFAULTS } from "@baryon/visualizer";

/**
 * R3F scene component. Sets up audio, loads the Baryon GLB, wires the full
 * TSL compute pipeline (Phases 2–5), and renders the particle Points mesh.
 *
 * R3F note: any useFrame with priority > 0 disables R3F's built-in render.
 * This component therefore owns rendering via pipelineRef.current.render().
 *
 * RenderPipeline is created lazily on the first frame so that R3F has already
 * called renderer.setSize() — PassNode then creates its textures at the correct
 * canvas size and auto-resizes each frame via PassNode.updateBefore().
 */
export function BaryonScene({ setIsPlaying, setIsAudioLoaded }) {
  const { camera, gl, scene } = useThree();
  const audioRef       = useRef(null);
  const timeHandlerRef = useRef(null);
  const tslStateRef    = useRef(null);
  const pipelineRef    = useRef(null);
  const bloomUniforms  = useRef({
    strength:  uniform(DEFAULTS.bloomStrength),
    radius:    uniform(0.4),
    threshold: uniform(DEFAULTS.bloomThreshold),
  });
  // Live param object — tweakpane mutates this in place; useFrame reads it
  const controlsRef = useRef({
    bloomStrength:      DEFAULTS.bloomStrength,
    bloomRadius:        0.4,
    bloomThreshold:     DEFAULTS.bloomThreshold,
    particleSpeed:      DEFAULTS.particleSpeed,
    particleSize:       DEFAULTS.particleSize,
    flowFieldStrength:  DEFAULTS.flowFieldStrength,
    flowFieldFrequency: DEFAULTS.flowFieldFrequency,
    flowFieldInfluence: DEFAULTS.flowFieldInfluence,
  });
  const [points, setPoints] = useState(null);

  // ── Tweakpane GUI (created once, destroyed on unmount) ────────────────────
  useEffect(() => {
    const p = controlsRef.current;
    const pane = new Pane({ title: "Baryon", expanded: true });
    pane.element.style.zIndex = "10000";

    const bloomF = pane.addFolder({ title: "Bloom", expanded: false });
    bloomF.addBinding(p, "bloomStrength",  { label: "Strength",  min: 0, max: 3,   step: 0.01 });
    bloomF.addBinding(p, "bloomRadius",    { label: "Radius",    min: 0, max: 1,   step: 0.01 });
    bloomF.addBinding(p, "bloomThreshold", { label: "Threshold", min: 0, max: 1,   step: 0.01 });

    const partF = pane.addFolder({ title: "Particles", expanded: true });
    partF.addBinding(p, "particleSpeed", { label: "Speed", min: 1,    max: 100, step: 1     });
    partF.addBinding(p, "particleSize",  { label: "Size",  min: 0.001,max: 0.5, step: 0.001 });

    const flowF = pane.addFolder({ title: "Flow Field", expanded: false });
    flowF.addBinding(p, "flowFieldStrength",  { label: "Strength",  min: 0,    max: 10, step: 0.1  });
    flowF.addBinding(p, "flowFieldFrequency", { label: "Frequency", min: 0.01, max: 5,  step: 0.01 });
    flowF.addBinding(p, "flowFieldInfluence", { label: "Influence", min: 0,    max: 2,  step: 0.01 });

    return () => pane.dispose();
  }, []);

  // ── Main scene setup ──────────────────────────────────────────────────────
  useEffect(() => {
    const audio = getDefaultAudioContext();
    audioRef.current = audio;

    audio.setup(camera);
    timeHandlerRef.current = createTimeHandler(audio.getState);

    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    const { gltfLoader } = setupLoaders();

    (async () => {
      try {
        const gltf     = await gltfLoader.loadAsync("./glb/Baryon_v2.glb");
        const instance = gltf.scene.children[0];
        instance.scale.set(0.2, 0.2, 0.2);
        instance.updateMatrix();
        instance.geometry.applyMatrix4(instance.matrix);

        const audioState  = audio.getState();
        const parameters  = {
          count:            DEFAULTS.particleCount,
          radius:           DEFAULTS.radius,
          surfaceRatio:     DEFAULTS.surfaceRatio,
          surfaceThreshold: DEFAULTS.surfaceThreshold,
          threshold:        DEFAULTS.threshold,
        };
        const audioConfig = {
          capacity:   audioState.capacity,
          fftSize:    audioState.fftSize,
          sampleRate: audioState.audioCtx?.sampleRate ?? 44100,
        };

        const state = setupTSL(instance.geometry, parameters, audioConfig);
        tslStateRef.current = state;
        setPoints(state.points);

      } catch (err) {
        console.error("[BaryonScene] Setup failed:", err);
      }
    })();

    return () => {
      const s = audio.getState();
      if (s.listener) camera.remove(s.listener);
      if (tslStateRef.current) disposeTSL(tslStateRef.current);
      pipelineRef.current = null;
    };
  }, [camera, gl, scene, setIsPlaying, setIsAudioLoaded]);

  // priority 1 → R3F disables its auto-render; this callback owns rendering.
  //
  // RenderPipeline is created on the first frame (not in useEffect) so that
  // R3F's renderer.setSize() has already been called. PassNode then creates
  // its internal textures at the correct size and auto-resizes each frame via
  // PassNode.updateBefore() reading renderer.getDrawingBufferSize().
  useFrame((state) => {
    // Lazy-init RenderPipeline on first frame
    if (!pipelineRef.current) {
      const scenePass  = pass(scene, camera);
      const sceneColor = scenePass.getTextureNode("output");
      const { strength, radius, threshold } = bloomUniforms.current;
      const bloomPass  = bloom(sceneColor, strength, radius, threshold);
      const pipeline   = new RenderPipeline(gl);
      pipeline.outputNode = sceneColor.add(bloomPass);
      pipelineRef.current = pipeline;
    }

    if (!timeHandlerRef.current || !tslStateRef.current) return;

    const p = controlsRef.current;

    // Sync bloom TSL uniforms from controls
    bloomUniforms.current.strength.value  = p.bloomStrength;
    bloomUniforms.current.radius.value    = p.bloomRadius;
    bloomUniforms.current.threshold.value = p.bloomThreshold;

    // Sync particle/flow TSL uniforms from controls
    const u = tslStateRef.current.uniforms;
    u.uParticleSpeed.value      = p.particleSpeed;
    u.uParticleSize.value       = p.particleSize;
    u.uFlowFieldStrength.value  = p.flowFieldStrength;
    u.uFlowFieldFrequency.value = p.flowFieldFrequency;
    u.uFlowFieldInfluence.value = p.flowFieldInfluence;

    const { time, deltaTime } = timeHandlerRef.current(state.clock.getElapsedTime());
    tickTSL(gl, tslStateRef.current, audioRef.current.getState(), time, deltaTime);
    pipelineRef.current.render();
  }, 1);

  return (
    <>
      <OrbitControls enableDamping />
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
