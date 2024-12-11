#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uAverageAmplitude;
uniform float uRadius;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);

    // Set particle color based on zero point alpha
    particle.w = zeroPoint.a;

    // Choose target based on audio amplitude
    vec3 target = (uAverageAmplitude > 0.0) ? zeroPoint.xyz : base.xyz;

    // Smoothly interpolate to target
    float smoothSpeed = 0.95; // Higher = more stable but slower movement
    particle.xyz = mix(target, particle.xyz, smoothSpeed);

    // Constrain particles within radius (keeping this as a safety measure)
    float distanceFromCenter = length(particle.xyz);
    if(distanceFromCenter > uRadius) {
        particle.xyz = normalize(particle.xyz) * uRadius;
    }

    gl_FragColor = particle;
}