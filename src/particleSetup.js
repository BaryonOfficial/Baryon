import * as THREE from "three";

export const setupParticles = (parameters, sphereRadius, scene) => {
  let particlesGeometry, particlesMaterial, particlePoints;

  // Create a BufferGeometry for particles
  particlesGeometry = new THREE.BufferGeometry();

  // Create arrays for positions and colors
  const positions = new Float32Array(parameters.num * 3); // x, y, z for each particle

  // Create a PointsMaterial for particles with size, sizeAttenuation, and blending properties
  particlesMaterial = new THREE.PointsMaterial({
    size: 0.05, // Adjusted particle size with visible light trail effect
    sizeAttenuation: true,
    vertexColors: true, // Enable vertex colors
    blending: THREE.AdditiveBlending, // Additive blending for light effect
    depthWrite: false, // Prevent particles from affecting each other's depth test
    transparent: true, // Necessary for blending
  });

  // Initialize positions
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;

    const y = 1 - 2 * (i / parameters.num); // y goes from -1 to 1
    const radius = Math.sqrt(Math.random()) * sphereRadius; // radius at y

    const phi = 2 * Math.PI * (i / ((1 + Math.sqrt(5)) / 2)); // golden angle approximation

    // Initialize positions
    positions[i3] = radius * Math.cos(phi);
    positions[i3 + 1] = sphereRadius * y;
    positions[i3 + 2] = radius * Math.sin(phi);
  }

  // Add attributes to geometry
  particlesGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  // Create a Points object using the geometry and material
  particlePoints = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particlePoints);
  return { particlesGeometry, particlesMaterial, particlePoints };
};
