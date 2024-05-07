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
uniform bool uStarted;

void main() {
    float time = uTime * 1.0;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);
    particle.w = zeroPoint.a; // coloring

    vec3 target;
    if(uAverageAmplitude > 0.0 || uStarted == true) {
        target = zeroPoint.xyz;
    } else if(uAverageAmplitude <= 0.0 && uStarted == false) {
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

    vec3 lerpMovement;
    // Quickest patterns
    // if(distance > 1.0) {
    //     float alpha = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
    //     vec3 interpolatedPosition = mix(particle.xyz, target, alpha);
    //     lerpMovement = interpolatedPosition - particle.xyz;
    // } else {
    //     lerpMovement = vec3(0.0);
    // }

    // Improved pulsating effect with faster particle movement
    if(distance > 1.0) {
        float timeFactor = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        float alpha = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        if(uStarted) {
            float distanceFactor = smoothstep(0.0, 1.0, 1.0 - distance / (distance + 1.0));
            alpha = mix(distanceFactor, 1.0, timeFactor);
        }
        vec3 interpolatedPosition = mix(particle.xyz, target, alpha);
        lerpMovement = interpolatedPosition - particle.xyz;
    } else {
        lerpMovement = vec3(0.0);
    }

    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}