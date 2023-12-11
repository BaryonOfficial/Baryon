import * as THREE from "three";

export function setColor(distanceFromCenter, colors, i3) {
  const color = new THREE.Color();
  color.setHSL(1 - distanceFromCenter * 2, 1.0, 0.5);
  colors[i3] = color.r;
  colors[i3 + 1] = color.g;
  colors[i3 + 2] = color.b;
}
