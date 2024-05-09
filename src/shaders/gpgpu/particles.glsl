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
uniform int uParticleMovementType;
uniform float uRadius;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);

    // coloring
    particle.w = zeroPoint.a;

    vec3 target = (uAverageAmplitude > 0.0 || uStarted) ? zeroPoint.xyz : base.xyz; 

    // Calculate the distance between the particle position and the zero point
    float distance = length(target - particle.xyz);

    // Calculate the direction towards the zero point
    vec3 direction = normalize(target - particle.xyz);

    // Strength of the noise based on the zeroPoint texture
    float strength = simplexNoise4d(vec4(target * 0.2, uTime + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    strength = smoothstep(influence, 1.0, strength);

    // Add Simplex noise to the direction for organic movement
    vec3 flowField = normalize(vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, uTime))));

    vec3 adjustedDirection = direction + flowField * strength;
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;

    vec3 lerpMovement = vec3(0.0);
    if(distance > 1.0) {
        float timeFactor = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        float alpha = timeFactor;

        if(uParticleMovementType == 1 && uStarted) {
            float distanceFactor = smoothstep(0.0, 1.0, 1.0 - distance / (distance + 1.0));
            alpha = mix(distanceFactor, 1.0, timeFactor);
        }

        vec3 interpolatedPosition = mix(particle.xyz, target, alpha);
        lerpMovement = interpolatedPosition - particle.xyz;
    }

    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}