uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uTime;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;

varying vec3 vColor;
varying float vType;

void main() {
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    float time = uTime * 20.0;

    // Vibration
    float randomPhase = fract(sin(dot(aParticlesUv, vec2(12.9898, 78.233))) * 43758.5453);
    float uniqueTime = time + randomPhase * 20.0;
    float vibration = sin(uniqueTime) * 0.005; // Smaller amplitude for subtle effect
    particle.xyz += vibration;

    // Wave Pattern
    // float angle = atan(particle.y, particle.x);
    // float radius = length(particle.xy);
    // float wave = sin(angle * 10.0 + time) * 0.005;
    // particle.z += wave * radius;

    // Final position
    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Point size
    // float sizeIn = smoothstep(0.0, 0.1, particle.a);
    // float sizeOut = 1.0 - smoothstep(0.7, 1.0, particle.a);
    // float size = min(sizeIn, sizeOut);

    gl_PointSize = uSize * uResolution.y;
    gl_PointSize *= (1.0 / -viewPosition.z);

    // Varyings
    vColor = aColor;
    vType = particle.a;
}
