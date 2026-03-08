import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import {
  AUDIT_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/visualizer";

export function useBaryonControls() {
  const controlsRef = useRef({
    bloomEnabled: true,
    bloomStrength: RENDER_DEFAULTS.bloomStrength,
    bloomRadius: RENDER_DEFAULTS.bloomRadius,
    bloomThreshold: RENDER_DEFAULTS.bloomThreshold,
    backgroundColor: RENDER_DEFAULTS.backgroundColor,
    volumeColor: RENDER_DEFAULTS.color,
    surfaceColor: RENDER_DEFAULTS.surfaceColor,
    particleSpeed: SIMULATION_DEFAULTS.particleSpeed,
    particleSize: RENDER_DEFAULTS.particleSize,
    rotationSpeed: RENDER_DEFAULTS.rotationSpeed,
    zeroPointPrecision: SIMULATION_DEFAULTS.threshold,
    targetLerpThreshold: SIMULATION_DEFAULTS.distanceThreshold,
    surfaceParticles: true,
    particleMovementType: "Smoothed",
    idleLogoIntensity: RENDER_DEFAULTS.idleLogoIntensity,
    idleLogoAlpha: RENDER_DEFAULTS.idleLogoAlpha,
    idleLogoSize: RENDER_DEFAULTS.idleLogoSize,
    flowFieldStrength: SIMULATION_DEFAULTS.flowFieldStrength,
    flowFieldFrequency: SIMULATION_DEFAULTS.flowFieldFrequency,
    flowFieldInfluence: SIMULATION_DEFAULTS.flowFieldInfluence,
    auditEnabled: AUDIT_DEFAULTS.auditEnabled,
    freezeModeSlots: AUDIT_DEFAULTS.freezeModeSlots,
    injectTestTone: AUDIT_DEFAULTS.injectTestTone,
    pitchSourceMode: AUDIT_DEFAULTS.pitchSourceMode,
    testToneHz: AUDIT_DEFAULTS.testToneHz,
    testToneAmplitude: AUDIT_DEFAULTS.testToneAmplitude,
    logEveryFrames: AUDIT_DEFAULTS.logEveryFrames,
  });

  useEffect(() => {
    const p = controlsRef.current;
    const pane = new Pane({ title: "Baryon", expanded: true });
    pane.element.style.position = "fixed";
    pane.element.style.top = "1rem";
    pane.element.style.right = "1rem";
    pane.element.style.zIndex = "10000";

    const bloomF = pane.addFolder({ title: "Bloom", expanded: false });
    bloomF.addBinding(p, "bloomEnabled", { label: "Enabled" });
    bloomF.addBinding(p, "bloomStrength", { label: "Strength", min: 0, max: 3, step: 0.01 });
    bloomF.addBinding(p, "bloomRadius", { label: "Radius", min: 0, max: 1, step: 0.01 });
    bloomF.addBinding(p, "bloomThreshold", {
      label: "Extract Threshold",
      min: 0,
      max: 1,
      step: 0.01,
    });

    const colorF = pane.addFolder({ title: "Color", expanded: false });
    colorF.addBinding(p, "backgroundColor", { label: "Background", view: "color" });
    colorF.addBinding(p, "volumeColor", { label: "Volume", view: "color" });
    colorF.addBinding(p, "surfaceColor", { label: "Surface", view: "color" });

    const partF = pane.addFolder({ title: "Particles", expanded: true });
    partF.addBinding(p, "particleSpeed", { label: "Speed", min: 1, max: 100, step: 1 });
    partF.addBinding(p, "particleSize", { label: "Size", min: 0.001, max: 0.5, step: 0.001 });
    partF.addBinding(p, "rotationSpeed", { label: "Rotation", min: -12, max: 12, step: 0.01 });

    const flowF = pane.addFolder({ title: "Granular", expanded: false });
    flowF.addBinding(p, "flowFieldStrength", { label: "Strength", min: 0, max: 10, step: 0.1 });
    flowF.addBinding(p, "flowFieldFrequency", { label: "Frequency", min: 0.01, max: 5, step: 0.01 });
    flowF.addBinding(p, "flowFieldInfluence", { label: "Influence", min: 0, max: 2, step: 0.01 });
    flowF.addBinding(p, "targetLerpThreshold", {
      label: "Lerp Threshold",
      min: 0,
      max: 5,
      step: 0.01,
    });
    flowF.addBinding(p, "zeroPointPrecision", {
      label: "Node Threshold",
      min: 0.001,
      max: 0.1,
      step: 0.001,
    });

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
    idleF.addBinding(p, "idleLogoAlpha", { label: "Alpha", min: 0, max: 1, step: 0.01 });
    idleF.addBinding(p, "idleLogoSize", { label: "Scale", min: 0.1, max: 2, step: 0.01 });

    const auditF = pane.addFolder({ title: "Audit", expanded: false });
    auditF.addBinding(p, "auditEnabled", { label: "Enabled" });
    auditF.addBinding(p, "freezeModeSlots", { label: "Freeze Slots" });
    auditF.addBinding(p, "injectTestTone", { label: "Inject Tone" });
    auditF.addBinding(p, "pitchSourceMode", {
      label: "Pitch Source",
      options: {
        Auto: "auto",
        Worker: "worker",
        Fallback: "fallback",
      },
    });
    auditF.addBinding(p, "testToneHz", { label: "Tone Hz", min: 40, max: 2000, step: 1 });
    auditF.addBinding(p, "testToneAmplitude", { label: "Tone Amp", min: 0, max: 1, step: 0.01 });
    auditF.addBinding(p, "logEveryFrames", { label: "Log Frames", min: 1, max: 240, step: 1 });

    return () => pane.dispose();
  }, []);

  return controlsRef;
}
