/**
 * Controls
 */

export function guiSetup(
  gui,
  unrealBloomPass,
  renderer,
  particles,
  gpgpu,
  debugObject,
  materialParameters,
  parameters,
  stats,
  setShowStats
) {
  gui.close();

  const bloomFolder = gui.addFolder('Bloom Effect');
  bloomFolder.add(unrealBloomPass, 'enabled').name('Enable Bloom');
  bloomFolder.add(unrealBloomPass, 'strength').min(0).max(2).step(0.001).name('Bloom Strength');
  bloomFolder.add(unrealBloomPass, 'radius').min(-5).max(5).step(0.001).name('Bloom Radius');
  bloomFolder.add(unrealBloomPass, 'threshold').min(0).max(1).step(0.001).name('Bloom Threshold');
  bloomFolder.close();

  const colorFolder = gui.addFolder('Color Settings');
  colorFolder
    .addColor(debugObject, 'backgroundColor')
    .name('Background Color')
    .onChange(() => {
      renderer.setClearColor(debugObject.backgroundColor);
    });
  colorFolder
    .addColor(materialParameters, 'color')
    .name('Volume Color')
    .onChange((value) => {
      materialParameters.color = value;
      particles.material.uniforms.uColor.value.set(value);
    });
  colorFolder
    .addColor(materialParameters, 'surfaceColor')
    .name('Surface Color')
    .onChange((value) => {
      materialParameters.surfaceColor = value;
      particles.material.uniforms.uSurfaceColor.value.set(value);
    });
  colorFolder.close();

  const granularControls = gui.addFolder('Granular Controls');
  granularControls
    .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, 'value')
    .min(0.01)
    .max(1)
    .step(0.001)
    .name('FlowField Influence');
  granularControls
    .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, 'value')
    .min(0.01)
    .max(10)
    .step(0.001)
    .name('FlowField Strength');
  granularControls
    .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, 'value')
    .min(0.01)
    .max(1)
    .step(0.001)
    .name('FlowField Frequency');
  granularControls
    .add(gpgpu.particlesVariable.material.uniforms.uParticleSpeed, 'value')
    .min(1)
    .max(200)
    .step(0.001)
    .name('Particle Speed');
  granularControls
    .add(gpgpu.particlesVariable.material.uniforms.uDistanceThreshold, 'value')
    .min(0)
    .max(5.0)
    .step(0.001)
    .name('Target Lerp Threshold');
  granularControls
    .add(parameters, 'threshold')
    .min(0.001)
    .max(0.1)
    .step(0.001)
    .name('Zero-Point Precision')
    .onChange(() => {
      gpgpu.zeroPointsVariable.material.uniforms.uThreshold.value = parameters.threshold;
      gpgpu.particlesVariable.material.uniforms.uThreshold.value = parameters.threshold;
    });
  granularControls.close();

  const aesthetics = gui.addFolder('Aesthetics');
  aesthetics
    .add(particles.material.uniforms.uSize, 'value')
    .min(0)
    .max(1)
    .step(0.001)
    .name('Particle Size');
  aesthetics
    .add(particles.material.uniforms.uRotation, 'value')
    .min(-12)
    .max(12)
    .step(0.001)
    .name('Rotation Speed');
  aesthetics
    .add(gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl, 'value')
    .name('Surface Particles')
    .onChange(function (value) {
      gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl.value = value;
    });
  aesthetics
    .add(gpgpu.particlesVariable.material.uniforms.uParticleMovementType, 'value', {
      Quickest: 0,
      Smoothed: 1,
    })
    .name('Particle Movement Type')
    .onChange(function (value) {
      gpgpu.particlesVariable.material.uniforms.uParticleMovementType.value = value;
    });
  aesthetics.close();

  const performanceFolder = gui.addFolder('Performance');
  const performanceSettings = {
    showStats: false, // Initialize showStats property
  };

  performanceFolder
    .add(performanceSettings, 'showStats')
    .name('Show Stats Panel')
    .onChange((value) => {
      setShowStats(value);
    });

  // performanceFolder.close(); // Keeping this open by default could help users realize performance optimizations

  const resetDefaults = {
    reset: function () {
      // Reset Bloom Effect
      bloomFolder.controllers.forEach((controller) => {
        if (controller.property === 'enabled') controller.setValue(true);
        if (controller.property === 'strength') controller.setValue(0.36);
        if (controller.property === 'radius') controller.setValue(-2.0);
        if (controller.property === 'threshold') controller.setValue(0.4);
      });

      // Reset Color Settings
      colorFolder.controllers.forEach((controller) => {
        if (controller.property === 'backgroundColor') controller.setValue('#000000');
        if (controller.property === 'color') {
          const defaultColor = '#0586ff';
          controller.setValue(defaultColor);
          materialParameters.color = defaultColor;
          particles.material.uniforms.uColor.value.set(defaultColor);
        }
        if (controller.property === 'surfaceColor') {
          const defaultSurfaceColor = '#DEF0FA';
          controller.setValue(defaultSurfaceColor);
          materialParameters.surfaceColor = defaultSurfaceColor;
          particles.material.uniforms.uSurfaceColor.value.set(defaultSurfaceColor);
        }
      });

      // Reset Granular Controls
      granularControls.controllers.forEach((controller) => {
        if (controller.property === 'value' && controller._name === 'FlowField Influence')
          controller.setValue(1.0);
        if (controller.property === 'value' && controller._name === 'FlowField Strength')
          controller.setValue(3.6);
        if (controller.property === 'value' && controller._name === 'FlowField Frequency')
          controller.setValue(0.64);
        if (controller.property === 'value' && controller._name === 'Particle Speed')
          controller.setValue(32);
        if (controller.property === 'value' && controller._name === 'Target Lerp Threshold')
          controller.setValue(0.5);
        if (controller.property === 'threshold') controller.setValue(0.05);
      });

      // Reset Aesthetics
      aesthetics.controllers.forEach((controller) => {
        if (controller.property === 'value' && controller._name === 'Particle Size')
          controller.setValue(0.03);
        if (controller.property === 'value' && controller._name === 'Rotation Speed')
          controller.setValue(2.5);
        if (controller.property === 'value' && controller._name === 'Surface Particles')
          controller.setValue(true);
        if (controller.property === 'value' && controller._name === 'Particle Movement Type')
          controller.setValue(1);
      });

      // Reset Performance Settings
      performanceFolder.controllers.forEach((controller) => {
        if (controller.property === 'showStats') controller.setValue(false);
      });
    },
  };

  gui.add(resetDefaults, 'reset').name('Reset to Defaults');
}
