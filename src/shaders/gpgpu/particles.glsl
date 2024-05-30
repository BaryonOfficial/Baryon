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
uniform bool uMicActive;
uniform int uParticleMovementType;
uniform float uRadius;
uniform float uDistanceThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);

    // coloring
    particle.w = zeroPoint.a;

    vec3 target = (uAverageAmplitude > 0.0) ? zeroPoint.xyz : base.xyz;

    float distance = length(target - particle.xyz);
    vec3 direction = normalize(target - particle.xyz);

    //  Pulsating Effect (BROKEN)
    // float normalizedAmplitude = uAverageAmplitude / 255.0;
    // float pulsatingFactor = 1.0 + normalizedAmplitude * 1.5;
    // vec3 pulsatedTarget = target * pulsatingFactor;

    // float distance = length(pulsatedTarget - particle.xyz);
    // vec3 direction = normalize(pulsatedTarget - particle.xyz);

    // Strength of the noise based on the zeroPoint texture
    float strength = simplexNoise4d(vec4(target * 0.2, uTime + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    strength = smoothstep(influence, 1.0, strength);

    // Add Simplex noise to the direction for organic movement
    vec3 flowField = normalize(vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, uTime))));

    vec3 adjustedDirection = direction + flowField * strength;
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;

    vec3 lerpMovement = vec3(0.0);
    if(distance > uDistanceThreshold) {
        float timeFactor = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        float alpha = timeFactor;

        if(uParticleMovementType == 1 && uStarted) {
            float distanceFactor = smoothstep(0.0, 1.0, 1.0 - distance / (distance + 1.0));
            alpha = mix(distanceFactor, 1.0, timeFactor);
        }

        // Introduce damping factor based on distance
        float dampingFactor = 1.0 - exp(-distance * 5.0);  // Exponential decay based on distance
        alpha *= dampingFactor;

        vec3 interpolatedPosition = mix(particle.xyz, target, alpha);
        lerpMovement = interpolatedPosition - particle.xyz;
    }

    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}