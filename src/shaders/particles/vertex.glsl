uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uTime;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;

varying vec3 vColor;
varying float vGroup;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    float time = uTime * 20.0;

    // Wave Propagation
    // float waveFrequency = 5.0;
    // float waveAmplitude = 0.01;
    // float wavePhase = time * 0.1;
    // vec3 waveOffset = vec3(sin(particle.x * waveFrequency + wavePhase), sin(particle.y * waveFrequency + wavePhase), sin(particle.z * waveFrequency + wavePhase)) * waveAmplitude;
    // particle.xyz += waveOffset;

    // Final position
    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);

    // Point size
    gl_PointSize = uSize * uResolution.y;
    gl_PointSize *= (1.0 / -viewPosition.z);

    // Varyings
    vColor = aColor;
    vGroup = particle.w;
    vPosition = modelPosition.xyz;
    vNormal = modelNormal.xyz;
}