#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uParticleSpeed;
uniform float uAverageAmplitude;
uniform float uRadius;
uniform float uDistanceThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);

    // Set particle color based on zero point alpha
    particle.w = zeroPoint.a;

    // Choose target based on audio amplitude
    vec3 target = (uAverageAmplitude > 0.0) ? zeroPoint.xyz : base.xyz;

    // Calculate distance and direction to target
    float distance = length(target - particle.xyz);
    vec3 direction = normalize(target - particle.xyz);

    // Generate flow field noise
    vec3 noiseInput = particle.xyz * uFlowFieldFrequency;
    vec3 flowField = normalize(vec3(simplexNoise4d(vec4(noiseInput, uTime)), simplexNoise4d(vec4(noiseInput + 1.0, uTime)), simplexNoise4d(vec4(noiseInput + 2.0, uTime))));

    // Calculate noise strength with improved influence control
    float noiseStrength = simplexNoise4d(vec4(target * 0.2, uTime + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    noiseStrength = smoothstep(influence, 1.0, noiseStrength);

    // Combine direction with flow field
    vec3 adjustedDirection = normalize(direction + flowField * noiseStrength);
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;

    // Calculate interpolated movement for distant particles
    vec3 lerpMovement = vec3(0.0);
    if(distance > uDistanceThreshold) {
        float timeFactor = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        float distanceFactor = smoothstep(0.0, 1.0, 1.0 - distance / (distance + 1.0));

        // Apply damping based on distance
        float dampingFactor = 1.0 - exp(-distance * 5.0);
        float alpha = mix(distanceFactor, 1.0, timeFactor) * dampingFactor;

        lerpMovement = mix(particle.xyz, target, alpha) - particle.xyz;
    }

    // Update particle position
    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}