#define MAX_N 100
#define PI 3.14159265359

// Function params
uniform sampler2D uBase;
uniform float uRadius;

// // Function to calculate the Chladni pattern displacement using wave data from texture
float chladni(vec3 position, float radius, vec4 waveData) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;
    float Ai = waveData.r;
    float ui = waveData.g;
    float vi = waveData.b;
    float wi = waveData.a;
    sum += Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    return sum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 base = texture(uBase, uv);
    vec3 position = base.xyz;

    vec4 waveData = texture(uAudioData, uv);

    float value = chladni(position, uRadius, waveData);

    gl_FragColor = vec4(position, value);
}
