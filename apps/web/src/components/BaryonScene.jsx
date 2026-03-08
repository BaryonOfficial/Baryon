// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { Pane } from "tweakpane";
import { getDefaultAudioContext } from "@baryon/visualizer/audio";
import {
  createTimeHandler,
  setupLoaders,
  setupTSL,
  tickTSL,
  disposeTSL,
  createAudioFeatureState,
  buildAudioFeatureFrame,
  DEFAULTS,
} from "@baryon/visualizer";

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
  const audioFeatureRef = useRef(null);
  const timeHandlerRef = useRef(null);
  const tslStateRef    = useRef(null);
  const pipelineRef    = useRef(null);
  const postNodesRef   = useRef(null);
  const bloomUniforms  = useRef({
    strength:  uniform(DEFAULTS.bloomStrength),
    radius:    uniform(DEFAULTS.bloomRadius),
    threshold: uniform(DEFAULTS.bloomThreshold),
  });
  // Live param object — tweakpane mutates this in place; useFrame reads it
  const controlsRef = useRef({
    bloomEnabled:       true,
    bloomStrength:      DEFAULTS.bloomStrength,
    bloomRadius:        DEFAULTS.bloomRadius,
    bloomThreshold:     DEFAULTS.bloomThreshold,
    backgroundColor:    DEFAULTS.backgroundColor,
    volumeColor:        DEFAULTS.color,
    surfaceColor:       DEFAULTS.surfaceColor,
    particleSpeed:      DEFAULTS.particleSpeed,
    particleSize:       DEFAULTS.particleSize,
    rotationSpeed:      DEFAULTS.rotationSpeed,
    zeroPointPrecision: DEFAULTS.threshold,
    targetLerpThreshold: DEFAULTS.distanceThreshold,
    surfaceParticles:   true,
    particleMovementType: "Smoothed",
    idleLogoIntensity:  DEFAULTS.idleLogoIntensity,
    idleLogoAlpha:      DEFAULTS.idleLogoAlpha,
    idleLogoSize:       DEFAULTS.idleLogoSize,
    flowFieldStrength:  DEFAULTS.flowFieldStrength,
    flowFieldFrequency: DEFAULTS.flowFieldFrequency,
    flowFieldInfluence: DEFAULTS.flowFieldInfluence,
    auditEnabled:       false,
    freezeModeSlots:    false,
    injectTestTone:     false,
    testToneHz:         440,
    testToneAmplitude:  0.5,
    logEveryFrames:     30,
  });
  const [points, setPoints] = useState(null);

  // ── Tweakpane GUI (created once, destroyed on unmount) ────────────────────
  useEffect(() => {
    const p = controlsRef.current;
    const pane = new Pane({ title: "Baryon", expanded: true });
    pane.element.style.position = "fixed";
    pane.element.style.top = "1rem";
    pane.element.style.right = "1rem";
    pane.element.style.zIndex = "10000";

    const bloomF = pane.addFolder({ title: "Bloom", expanded: false });
    bloomF.addBinding(p, "bloomEnabled",   { label: "Enabled" });
    bloomF.addBinding(p, "bloomStrength",  { label: "Strength",  min: 0, max: 3,   step: 0.01 });
    bloomF.addBinding(p, "bloomRadius",    { label: "Radius",    min: 0, max: 1,   step: 0.01 });
    bloomF.addBinding(p, "bloomThreshold", { label: "Extract Threshold", min: 0, max: 1,   step: 0.01 });

    const colorF = pane.addFolder({ title: "Color", expanded: false });
    colorF.addBinding(p, "backgroundColor", { label: "Background", view: "color" });
    colorF.addBinding(p, "volumeColor",     { label: "Volume",     view: "color" });
    colorF.addBinding(p, "surfaceColor",    { label: "Surface",    view: "color" });

    const partF = pane.addFolder({ title: "Particles", expanded: true });
    partF.addBinding(p, "particleSpeed", { label: "Speed", min: 1,    max: 100, step: 1     });
    partF.addBinding(p, "particleSize",  { label: "Size",  min: 0.001,max: 0.5, step: 0.001 });
    partF.addBinding(p, "rotationSpeed", { label: "Rotation", min: -12, max: 12, step: 0.01 });

    const flowF = pane.addFolder({ title: "Granular", expanded: false });
    flowF.addBinding(p, "flowFieldStrength",  { label: "Strength",  min: 0,    max: 10, step: 0.1  });
    flowF.addBinding(p, "flowFieldFrequency", { label: "Frequency", min: 0.01, max: 5,  step: 0.01 });
    flowF.addBinding(p, "flowFieldInfluence", { label: "Influence", min: 0,    max: 2,  step: 0.01 });
    flowF.addBinding(p, "targetLerpThreshold", { label: "Lerp Threshold", min: 0, max: 5, step: 0.01 });
    flowF.addBinding(p, "zeroPointPrecision",  { label: "Node Threshold", min: 0.001, max: 0.1, step: 0.001 });

    const aestheticsF = pane.addFolder({ title: "Aesthetics", expanded: false });
    aestheticsF.addBinding(p, "surfaceParticles", { label: "Surface" });
    aestheticsF.addBinding(p, "particleMovementType", {
      label: "Movement",
      options: {
        Quickest: "Quickest",
        Smoothed: "Smoothed",
      },
    });

    const idleF = pane.addFolder({ title: "Idle Logo", expanded: false });
    idleF.addBinding(p, "idleLogoIntensity", { label: "Intensity", min: 0, max: 1, step: 0.01 });
    idleF.addBinding(p, "idleLogoAlpha",     { label: "Alpha",     min: 0, max: 1, step: 0.01 });
    idleF.addBinding(p, "idleLogoSize",      { label: "Scale",     min: 0.1, max: 2, step: 0.01 });

    const auditF = pane.addFolder({ title: "Audit", expanded: false });
    auditF.addBinding(p, "auditEnabled",      { label: "Enabled" });
    auditF.addBinding(p, "freezeModeSlots",   { label: "Freeze Slots" });
    auditF.addBinding(p, "injectTestTone",    { label: "Inject Tone" });
    auditF.addBinding(p, "testToneHz",        { label: "Tone Hz", min: 40, max: 2000, step: 1 });
    auditF.addBinding(p, "testToneAmplitude", { label: "Tone Amp", min: 0, max: 1, step: 0.01 });
    auditF.addBinding(p, "logEveryFrames",    { label: "Log Frames", min: 1, max: 240, step: 1 });

    return () => pane.dispose();
  }, []);

  // ── Main scene setup ──────────────────────────────────────────────────────
  useEffect(() => {
    const audio = getDefaultAudioContext();
    audioRef.current = audio;

    audio.setup(camera);
    audio.startAudioProcessing();
    timeHandlerRef.current = createTimeHandler(audio.getState);
    gl.setClearColor(new THREE.Color(DEFAULTS.backgroundColor));

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

        audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
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
      postNodesRef.current = { sceneColor, bloomPass };
    }

    if (!timeHandlerRef.current || !tslStateRef.current) return;

    const p = controlsRef.current;

    // Sync bloom TSL uniforms from controls
    if (pipelineRef.current && postNodesRef.current) {
      const { sceneColor, bloomPass } = postNodesRef.current;
      bloomPass.strength.value = p.bloomStrength;
      bloomPass.radius.value = p.bloomRadius;
      bloomPass.threshold.value = p.bloomThreshold;
      pipelineRef.current.outputNode = p.bloomEnabled
        ? sceneColor.add(bloomPass)
        : sceneColor;
    }

    // Sync particle/flow TSL uniforms from controls
    const u = tslStateRef.current.uniforms;
    gl.setClearColor(new THREE.Color(p.backgroundColor));
    u.uColor.value.set(p.volumeColor);
    u.uSurfaceColor.value.set(p.surfaceColor);
    u.uParticleSpeed.value      = p.particleSpeed;
    u.uParticleSize.value       = p.particleSize;
    u.uThreshold.value          = p.zeroPointPrecision;
    u.uDistanceThreshold.value  = p.targetLerpThreshold;
    u.uSurfaceControl.value     = p.surfaceParticles ? 1 : 0;
    u.uParticleMovementType.value = p.particleMovementType === "Smoothed" ? 1 : 0;
    u.uIdleLogoIntensity.value  = p.idleLogoIntensity;
    u.uIdleLogoAlpha.value      = p.idleLogoAlpha;
    u.uIdleLogoSize.value       = p.idleLogoSize;
    u.uFlowFieldStrength.value  = p.flowFieldStrength;
    u.uFlowFieldFrequency.value = p.flowFieldFrequency;
    u.uFlowFieldInfluence.value = p.flowFieldInfluence;

    const { time, deltaTime } = timeHandlerRef.current(state.clock.getElapsedTime());
    const audioState = audioRef.current.getState();
    if (audioFeatureRef.current?.audit?.settings) {
      Object.assign(audioFeatureRef.current.audit.settings, {
        enabled: p.auditEnabled,
        freezeModeSlots: p.freezeModeSlots,
        injectTestTone: p.injectTestTone,
        testToneHz: p.testToneHz,
        testToneAmplitude: p.testToneAmplitude,
        logEveryFrames: p.logEveryFrames,
      });
    }
    const featureFrame = buildAudioFeatureFrame(
      audioState,
      audioFeatureRef.current,
      tslStateRef.current.uniforms.uRadius.value
    );
    tickTSL(gl, tslStateRef.current, featureFrame, time, deltaTime);
    if (typeof window !== "undefined") {
      window.__baryonAuditSnapshot = tslStateRef.current.debugSnapshot;
    }
    if (p.auditEnabled && tslStateRef.current.debugSnapshot) {
      const frame = audioFeatureRef.current?.audit?.frame ?? 0;
      const interval = Math.max(1, Math.floor(p.logEveryFrames));
      if (frame % interval === 0) {
        console.log("[Baryon audit]", tslStateRef.current.debugSnapshot);
      }
    }
    if (tslStateRef.current.points) {
      tslStateRef.current.points.rotation.y -= deltaTime * 0.5 * p.rotationSpeed;
    }
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
