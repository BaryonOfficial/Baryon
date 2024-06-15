import * as THREE from 'three'

import noiseVertexShader from '../shaders/noise/vertex.glsl';
import noiseFragmentShader from '../shaders/noise/fragment.glsl';

export default class NoiseMesh extends THREE.Object3D {
    constructor() {
        super(); 

        this.init();
    }

    init() {

        const textureLoader = new THREE.TextureLoader();

        // create a wireframe material
        this.material = new THREE.ShaderMaterial( {
            uniforms: {
                tExplosion: {
                  type: "t",
                  value: textureLoader.load('./images/explosion.png'),
                },
                time: { // float initialized to 0
                  type: "f",
                  value: 0.0
                }
              },
            vertexShader: noiseVertexShader, 
            fragmentShader: noiseFragmentShader,
        } );

        // create a sphere and assign the material
        const mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry( 20, 4 ),
            this.material
        );

        this.add( mesh );
    }

    update(time) {
        this.material.uniforms[ 'time' ].value = .00025 * ( time );
    }
}