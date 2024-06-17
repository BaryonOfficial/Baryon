import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

import { postProcessingSetup } from '../postProcessing/postProcessingSetup.js';
import { guiSetup } from '../utils/guiSetup.js';
import { particlesSetup } from '../baryon/particlesSetup.js';
import { gpgpuSetup, disposeGPGPUResources } from '../baryon/gpgpuSetup.js';
import {
  audioObject,
  audioSetup,
  processAudioData,
  startAudioProcessing,
} from '../audio/audioSetup.js';
import { toggleRecording, toggleRecordingButton } from '../utils/recordRTC.js';

const ThreeScene = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    // Set up scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Set up camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    // Set up renderer
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Set up a simple cube
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Rotate the cube
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;

      renderer.render(scene, camera);
    };

    animate();

    // Clean up on component unmount
    return () => {
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: '100vw', height: '100vh', position: 'absolute', zIndex: 1 }}
    />
  );
};

export default ThreeScene;
