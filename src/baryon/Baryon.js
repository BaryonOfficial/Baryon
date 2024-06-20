import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class Baryon extends THREE.Object3D {
    constructor() {
        super();

        this.baryon = null;
        this.init();
    }

    init() {
        const loader = new GLTFLoader;

        loader.load('./glb/Baryon_v2.glb', (gltf) => {
            this.baryon = gltf.scene;
            this.baryon.scale.multiplyScalar(.3);
            this.baryon.position.z = -.1
            this.add(gltf.scene);
        })
    }

    update(time) {
        this.rotation.y = Math.sin(time) / 5;
        this.rotation.x = Math.cos(time) / 10;
    }
}

export const baryon = new Baryon(); 
