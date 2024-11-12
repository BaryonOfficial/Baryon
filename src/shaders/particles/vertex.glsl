#include ../includes/random2D.glsl
precision mediump float;

uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uTime;
uniform float uDeltaTime;
uniform float uAverageAmplitude;
uniform float uRadius;
uniform float uRotation;
uniform bool uSoundPlaying;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;

// varying vec3 vColor;
varying float vGroup;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    vGroup = particle.w;

    // Calculate the normal based on the particle position
    vec3 normal = normalize(particle.xyz);

    // Pulsating Effect
    float normalizedAmplitude = uAverageAmplitude / 255.0;
    vec3 pulsatingOffset = normal * normalizedAmplitude * uRadius;
    particle.xyz += pulsatingOffset;

    // Calculate model position
    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);

    // Glitch Effect (Broken)
    // float glitchTime = uTime - modelPosition.y;
    // float glitchStrength = sin(glitchTime + sin(glitchTime * 3.45) + sin(glitchTime * 8.76));
    // glitchStrength /= 3.0;
    // glitchStrength = smoothstep(0.3, 1.0, glitchStrength);
    // glitchStrength *= 0.25;
    // modelPosition.x += random2D(modelPosition.xz + uTime) - 0.5 * glitchStrength;
    // modelPosition.z += random2D(modelPosition.zx + uTime) - 0.5 * glitchStrength;

    // Calculate view and projected positions  
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    // Calculate model normal
    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);

    // Point size
    float restingSize = uSize * uResolution.y;
    restingSize *= (1.0 / -viewPosition.z);

    // Calculate the size multiplier based on the pulsating distance
    float sizeMultiplier = 1.0 + (length(pulsatingOffset) / uRadius);

    // Apply size multiplier
    gl_PointSize = restingSize * sizeMultiplier;

    // Pass Varyings
    vPosition = modelPosition.xyz;
    // vColor = aColor;
    vNormal = modelNormal.xyz;
}