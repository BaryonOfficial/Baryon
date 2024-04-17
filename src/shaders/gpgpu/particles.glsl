#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uRate;
uniform float uParticleSpeed;

void main() {
    float time = uTime * 1.0;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);

    // Sample the zero point texture to get the nearest zero point
    vec4 zeroPoint = texture(uZeroPoints, uv);

    // Calculate the distance between the particle position and the zero point
    float distance = length(zeroPoint.xyz - particle.xyz);

    // Calculate the direction towards the zero point
    vec3 direction = normalize(zeroPoint.xyz - particle.xyz);

    // Strength of the noise based on the base texture and distance to the zero point
    float strength = simplexNoise4d(vec4(zeroPoint.xyz * 0.2, time + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    strength = smoothstep(influence, 1.0, strength);

    // Add Simplex noise to the direction for organic movement
    vec3 flowField = vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time)));
    flowField = normalize(flowField);

    vec3 adjustedDirection = direction + flowField * strength;

    // float velocity = distance / (uDeltaTime * uParticleSpeed);

    // Update the particle position based on the adjusted direction and flow field strength
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;
    particle.xyz += movement;

    particle.w = zeroPoint.a; // coloring

    gl_FragColor = particle;
}