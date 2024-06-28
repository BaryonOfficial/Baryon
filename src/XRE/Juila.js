import * as THREE from 'three';

// Load shaders
const vertexShader = `
    varying vec3 vPosition;

    void main() {
        vPosition = position;
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `;  // Load vertex.glsl content
const fragmentShader = `
    varying vec3 vPosition;

    void main() {
        float intensity = length(vPosition);
        vec3 color = vec3(0.3 + 0.3 * sin(1.2831 * vPosition.x + intensity),
                        0.5 + 0.5 * sin(1.2831 * vPosition.y + intensity),
                        0.4 + 0.5 * sin(1.2831 * vPosition.z + intensity));
        gl_FragColor = vec4(color, 1.0);
    }
    `; // Load fragment.glsl content


// Function to randomize operations
function randomizeOperations(x, y, z, c) {
    const operations = [
        { xt: x * x - y * y - z * z + c.x, yt: 2 * x * y + c.y, zt: 2 * x * z + c.z },
        { xt: x * x - z * z - y * y + c.x, yt: 2 * x * z + c.y, zt: 2 * x * y + c.z },
        { xt: -y * y + x * x - z * z + c.x, yt: 2 * y * z + c.y, zt: 2 * y * x + c.z },
        { xt: -z * z + x * x - y * y + c.x, yt: 2 * z * x + c.y, zt: 2 * z * y + c.z },
        { xt: x * x + y * y - z * z + c.x, yt: 2 * x * z + c.y, zt: 2 * y * z + c.z },
        { xt: x * x + z * z - y * y + c.x, yt: 2 * y * x + c.y, zt: 2 * z * y + c.z },
    ];
    const randomIndex = Math.floor(Math.random() * operations.length);
    return operations[randomIndex];
}

export class Juila3D extends THREE.Object3D {
    constructor() {
        super();

        const c = new THREE.Vector3(-2 * Math.random(), -Math.random(), Math.random()); // Adjust these for different Julia sets
        const points = [];
        const numPoints = 100000;
        const scale = 1.5;

        // Generate Julia set points
        for (let i = 0; i < numPoints; i++) {
            let x = (Math.random() - 0.5) * 4;
            let y = (Math.random() - 0.5) * 4;
            let z = (Math.random() - 0.5) * 4;
            let iterations = 0;
            while (x * x + y * y + z * z < 4 && iterations < 256) {
                const { xt, yt, zt } = randomizeOperations(x, y, z, c);
                x = xt;
                y = yt;
                z = zt;
                iterations++;
            }
            if (iterations < 256) {
                points.push(new THREE.Vector3(x * scale, y * scale, z * scale));
            }
        }
        // Create particle geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create shader material
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        this.points = new THREE.Points(geometry, material);
        this.add(this.points);
    }

    update(time) {
        this.points.rotation.x += 0.0001;
        this.points.rotation.y += 0.0005;
    }
}