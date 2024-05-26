/**
* Controls
*/

export function guiSetup(gui, unrealBloomPass, renderer, particles, gpgpu, debugObject, materialParameters, parameters) {
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
        .onChange(() => {
            particles.material.uniforms.uColor.value.set(materialParameters.color);
        });
    colorFolder.close();

    const granularControls = gui.addFolder('Granular Controls');
    granularControls
        .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, 'value')
        .min(0.01)
        .max(1)
        .step(0.001)
        .name('uFlowFieldInfluence');
    granularControls
        .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, 'value')
        .min(0.1)
        .max(10)
        .step(0.001)
        .name('uFlowFieldStrength');
    granularControls
        .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, 'value')
        .min(0.01)
        .max(1)
        .step(0.001)
        .name('uFlowFieldFrequency');
    granularControls
        .add(gpgpu.particlesVariable.material.uniforms.uParticleSpeed, 'value')
        .min(1)
        .max(200)
        .step(0.001)
        .name('uParticleSpeed');
    granularControls
        .add(parameters, 'threshold')
        .min(0.01)
        .max(5)
        .step(0.001)
        .name('uThreshold')
        .onChange(() => {
            gpgpu.zeroPointsVariable.material.uniforms.uThreshold.value = parameters.threshold;
            gpgpu.particlesVariable.material.uniforms.uThreshold.value = parameters.threshold;
        });
    granularControls.close();

    const aesthetics = gui.addFolder('Aesthetics');
    aesthetics.add(particles.material.uniforms.uSize, 'value').min(0).max(1).step(0.001).name('uSize');
    aesthetics
        .add(particles.material.uniforms.uRotation, 'value')
        .min(0)
        .max(10)
        .step(0.001)
        .name('uRotation');
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

}