import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFShadowMap;
// renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ReinhardToneMapping;
// renderer.toneMappingExposure = 1.5;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

debugObject.backgroundColor = '#000000';
renderer.setClearColor(debugObject.backgroundColor);
/**
 * Post Processing
 */

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
unrealBloomPass.enabled = false;
effectComposer.addPass(unrealBloomPass);

const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
effectComposer.addPass(gammaCorrectionPass);

if (renderer.getPixelRatio() === 1 && !renderer.capabilities.isWebGL2) {
  // Antialiasing must be after gammaCorrection
  const smaaPass = new SMAAPass();
  effectComposer.addPass(smaaPass);

  console.log('SMAA enabled');
}

const materialParameters = {};

// materialParameters.color = new THREE.Color('rgb(77,142,236)');
materialParameters.color = new THREE.Color('rgb(18, 198, 211)');

// Material
particles.material = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  // depthWrite: false,
  // depthTest: false,
  blending: THREE.AdditiveBlending,
  // vertexColors: true,
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms: {
    uSize: new THREE.Uniform(0.03),
    uResolution: new THREE.Uniform(
      new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
    ),
    uParticlesTexture: new THREE.Uniform(),
    uTime: new THREE.Uniform(0),
    uColor: new THREE.Uniform(new THREE.Color(materialParameters.color)),
    uRadius: new THREE.Uniform(parameters.radius),
  },
});

// GUI for effects

const bloomFolder = gui.addFolder('Bloom Effect');

unrealBloomPass.strength = 0.05;
unrealBloomPass.radius = 1;
unrealBloomPass.threshold = 0.6;

bloomFolder.add(unrealBloomPass, 'enabled').name('Enable Bloom');
bloomFolder.add(unrealBloomPass, 'strength').min(0).max(2).step(0.001).name('Bloom Strength');
bloomFolder.add(unrealBloomPass, 'radius').min(0).max(2).step(0.001).name('Bloom Radius');
bloomFolder.add(unrealBloomPass, 'threshold').min(0).max(1).step(0.001).name('Bloom Threshold');
bloomFolder.close();

const colorFolder = gui.addFolder('Color Settings');

colorFolder.addColor(debugObject, 'backgroundColor').onChange(() => {
  renderer.setClearColor(debugObject.backgroundColor);
});
colorFolder.addColor(materialParameters, 'color').onChange(() => {
  particles.material.uniforms.uColor.value.set(materialParameters.color);
});
colorFolder.close();

effectComposer.render();
