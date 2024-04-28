#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uParticleSpeed;
uniform float uThreshold;
uniform float uAverageAmplitude;
uniform float vGroup;

void main() {
    float time = uTime * 1.0;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);
    particle.w = zeroPoint.a; // coloring

    vec3 target;
    if(uAverageAmplitude > 0.0) {
        target = zeroPoint.xyz;
    } else {
        target = base.xyz;
    }

    // Calculate the distance between the particle position and the zero point
    float distance = length(target - particle.xyz);

    // Calculate the direction towards the zero point
    vec3 direction = normalize(target - particle.xyz);

    // Strength of the noise based on the zeroPoint texture
    float strength = simplexNoise4d(vec4(target * 0.2, time + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    strength = smoothstep(influence, 1.0, strength);

    // Add Simplex noise to the direction for organic movement
    vec3 flowField = vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time)));
    flowField = normalize(flowField);

    vec3 adjustedDirection = direction + flowField * strength;
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;

    // vec3 lerpMovement = mix(particle.xyz, target, clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0)) - particle.xyz;
    //Adjusts speed while accounting for distance to the zero point
    vec3 lerpMovement = distance > uThreshold ? mix(particle.xyz, target, clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0)) - particle.xyz : vec3(0.0);

    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}