#include ../includes/random2D.glsl

uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uTime;
uniform float uAverageAmplitude;
uniform float uRadius;
uniform float uRotation;

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
    vGroup = particle.w;

    // Calculate the normal based on the particle position
    vec3 normal = normalize(particle.xyz);

     // Pulsating Effect
    if(vGroup == 1.0 || vGroup == 2.0) {
        float normalizedAmplitude = uAverageAmplitude / 255.0;
        // Calculate the maximum distance the particle can move
        float maxDistance = uRadius * 1.5;
        // Calculate the pulsating offset
        vec3 pulsatingOffset = normal * normalizedAmplitude * maxDistance;
        particle.xyz += pulsatingOffset;
    }

    // // Wave Propagation
    // float waveFrequency = 5.0;
    // float waveAmplitude = 0.01;
    // float wavePhase = time * 0.1;
    // vec3 waveOffset = vec3(sin(particle.x * waveFrequency + wavePhase), sin(particle.y * waveFrequency + wavePhase), sin(particle.z * waveFrequency + wavePhase)) * waveAmplitude;
    // particle.xyz += waveOffset;

    // Final position
    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);

    // Spin
    // float angle = atan(modelPosition.x, modelPosition.z);
    // float distanceToCenter = length(modelPosition.xz);
    // float angleOffset = uTime * uRotation;
    // angle += angleOffset;
    // modelPosition.x = cos(angle) * distanceToCenter;
    // modelPosition.z = sin(angle) * distanceToCenter;

    // Glitch Effect (Broken)
    // float glitchTime = uTime - modelPosition.y;
    // float glitchStrength = sin(glitchTime + sin(glitchTime * 3.45) + sin(glitchTime * 8.76));
    // glitchStrength /= 3.0;
    // glitchStrength = smoothstep(0.3, 1.0, glitchStrength);
    // glitchStrength *= 0.25;
    // modelPosition.x += random2D(modelPosition.xz + uTime) - 0.5 * glitchStrength;
    // modelPosition.z += random2D(modelPosition.zx + uTime) - 0.5 * glitchStrength;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);

    // Point size
    gl_PointSize = uSize * uResolution.y;
    gl_PointSize *= (1.0 / -viewPosition.z);

    // Varyings
    vColor = aColor;
    vPosition = modelPosition.xyz;
    vNormal = modelNormal.xyz;
}