#define MAX_N 100
#define PI 3.14159265359
#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;

// Function params
uniform float waveComponents[4 * MAX_N];
uniform int N;
uniform float uRadius;

// Function to calculate the Chladni pattern displacement
float chladni(vec3 position) {
    float sum = 0.0;
    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];
        sum += Ai * sin(ui * PI * position.x) * sin(vi * PI * position.y) * sin(wi * PI * position.z);
    }
    return sum;
}

void main() {
    float time = uTime * 0.2;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);

    float chladniValue = chladni(particle.xyz);

    // Particle death
    if(particle.a >= 1.0) {
        particle.a = mod(particle.a, 1.0);
        particle.xyz = base.xyz;
    } else {
    // Strength
        float strength = simplexNoise4d(vec4(base.xyz * 0.2, time + 1.0));
        float influence = (uFlowFieldInfluence - 0.5) * -2.0;
        strength = smoothstep(influence, 1.0, strength);
    // Flow field
        vec3 flowField = vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time)));
        flowField = normalize(flowField);
        particle.xyz += flowField * uDeltaTime * strength * uFlowFieldStrength;

    // Decay
        particle.a += uDeltaTime * 0.3;
    }

    gl_FragColor = particle;
}
