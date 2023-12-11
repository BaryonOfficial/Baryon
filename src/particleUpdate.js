import * as THREE from "three";
import { setColor } from "./colorLogic.js";

// Update particle positions
export const updateParticles = (
  particlesGeometry,
  parameters,
  sphereRadius,
  chladni
) => {
  const positions = particlesGeometry.attributes.position.array;
  const colors = new Float32Array(parameters.num * 3); // r, g, b for each particle
  const color = new THREE.Color();
  const minWalk = 0.002;

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;

    // Calculate Chladni pattern value
    let x = positions[i3] / sphereRadius;
    let y = positions[i3 + 1] / sphereRadius;
    let z = positions[i3 + 2] / sphereRadius;
    let chladniValue = chladni(x, y, z, parameters.N, parameters);

    let stochasticAmplitude = parameters.vel * Math.abs(chladniValue);

    // Ensure min movement
    // stochasticAmplitude = Math.max(stochasticAmplitude, minWalk)

    const randomMovementX = randomInRange(
      -stochasticAmplitude,
      stochasticAmplitude
    );
    const randomMovementY = randomInRange(
      -stochasticAmplitude,
      stochasticAmplitude
    );
    const randomMovementZ = randomInRange(
      -stochasticAmplitude,
      stochasticAmplitude
    );

    positions[i3] += randomMovementX;
    positions[i3 + 1] += randomMovementY;
    positions[i3 + 2] += randomMovementZ;

    const distanceFromCenter = Math.sqrt(x ** 2 + y ** 2 + z ** 2);

    setColor(distanceFromCenter, colors, i3);

    // Keep particles within the sphere
    const distance = Math.sqrt(
      positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2
    );
    if (distance > sphereRadius) {
      const scale = sphereRadius / distance;
      positions[i3] *= scale;
      positions[i3 + 1] *= scale;
      positions[i3 + 2] *= scale;
    }
  }

  // Set color attribute
  particlesGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  particlesGeometry.attributes.position.needsUpdate = true;
};
