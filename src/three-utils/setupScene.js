import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function setupScene(canvasRef) {
  const canvas = canvasRef.current;
  const context = canvas.getContext('webgl2');
  const scene = new THREE.Scene();

  // Sizes
  const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
  };

  // Camera
  const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
  camera.position.set(0, 3, 20);
  scene.add(camera);

  // Controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    context: context,
    antialias: true,
  });
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
  renderer.setClearColor('#000000');
  

  return { canvas, context, scene, sizes, camera, controls, renderer };
}
