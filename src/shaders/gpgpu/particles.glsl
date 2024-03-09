#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uThreshold;
uniform float uZeroPointSpeed;

void main() {
    float time = uTime * 1.0;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);

    // Sample the zero point texture to get the nearest zero point
    vec3 zeroPoint = texture(uZeroPoints, uv).xyz;

    // Calculate the distance between the particle position and the zero point
    float distance = length(zeroPoint - particle.xyz);

    vec3 targetPosition = particle.xyz;

    // If the distance is less than the threshold, consider the particle at the zero point
    if(distance < uThreshold) {
        targetPosition = zeroPoint;
    } else {
        // Calculate the direction towards the zero point
        vec3 direction = normalize(zeroPoint - particle.xyz);

        // Add Simplex noise to the direction for organic movement
        vec3 noiseOffset = vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time))) * uFlowFieldStrength;

        direction += noiseOffset;
        direction = normalize(direction);

        // Calculate the target position based on the current position and direction
        targetPosition = particle.xyz + direction * uDeltaTime * uZeroPointSpeed;
    }

    // Interpolate between the current position and the target position
    particle.xyz = mix(particle.xyz, targetPosition, 0.1);

    gl_FragColor = particle;
}
