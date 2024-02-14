precision mediump float;

out vec2 vUv;

void main() {
    vUv = uv;
    vec4 modelPosition = (modelMatrix * vec4(position, 1.0));
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    // Project the vertex
    gl_Position = projectedPosition;

}