// By Brandon Castro 
import * as THREE from 'three';
import { XRButton, OrbitControls } from 'three/examples/jsm/Addons.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { Baryon } from './Baryon';
import { playlists } from './utils/utils';

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 5, 15);

scene.add(new THREE.AxesHelper(1));

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.xr.enabled = true;
renderer.xr.setFoveation(0.0);

document.body.appendChild(renderer.domElement);
document.body.appendChild(XRButton.createButton(renderer));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target = new THREE.Vector3(0, 0, 0);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --

const baryon = new Baryon(renderer, camera);
// baryon.scale.multiplyScalar(1 / 5);
// baryon.position.set(0, 1.25, -1);
scene.add(baryon);

const song = playlists[0].songs[7]
baryon.loadAudio(song.audio);
// baryon.play();

// --

// Handle the XR session start event
renderer.xr.addEventListener('sessionstart', () => {
});

// Handle the XR session end event
renderer.xr.addEventListener('sessionend', () => {
    console.log('XR Session ended');
});

const clock = new THREE.Clock();
let framecount = 0;

// 144, 90, 75, 60 
function animate(time, xrFrame) {

    stats.begin();

    const e = clock.getElapsedTime();
    //const d = clock.getDelta();

    baryon.update(e); // this will internally only update at the specified frame rate

    //controls.update();
    renderer.render(scene, camera);
    stats.end();

    framecount++;
}
