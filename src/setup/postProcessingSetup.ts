import * as THREE from 'three';

// Passes
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/**
 * Post Processing
 */

export function postProcessingSetup(renderer, scene, camera, sizes) {
  const renderTarget = new THREE.WebGLRenderTarget(800, 600, {
    samples: renderer.getPixelRatio() === 1 ? 2 : 0,
  });

  const effectComposer = new EffectComposer(renderer, renderTarget);
  effectComposer.setPixelRatio(sizes.pixelRatio);
  effectComposer.setSize(sizes.width, sizes.height);

  const renderPass = new RenderPass(scene, camera);
  effectComposer.addPass(renderPass);

  // Must be before GammaCorrection
  const unrealBloomPass = new UnrealBloomPass();
  unrealBloomPass.enabled = true;
  effectComposer.addPass(unrealBloomPass);

  unrealBloomPass.strength = 0.36;
  unrealBloomPass.radius = -2.0;
  unrealBloomPass.threshold = 0.4;

  const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
  effectComposer.addPass(gammaCorrectionPass);

  if (renderer.getPixelRatio() === 1 && !renderer.capabilities.isWebGL2) {
    // Antialiasing must be after gammaCorrection
    const smaaPass = new SMAAPass();
    effectComposer.addPass(smaaPass);

    console.log('SMAA enabled');
  }

  return { effectComposer: effectComposer, unrealBloomPass: unrealBloomPass };
}
