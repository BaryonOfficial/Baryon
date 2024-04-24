#define MAX_N 100
#define PI 3.14159265359

// Function params
uniform sampler2D uBase;
uniform float uRadius;
uniform int capacity;

// Function to calculate the Chladni pattern displacement w/ radius
float chladni(vec3 position, float radius) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;

    for(int i = 0; i < capacity; ++i) {
        vec2 uv = vec2((float(i) + 0.5) / float(capacity), 0.5);
        vec4 waveData = texture(uAudioData, uv);

        float Ai = waveData.w;
        float ui = waveData.x;
        float vi = waveData.y;
        float wi = waveData.z;

        sum += Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    }

    return sum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 base = texture(uBase, uv);
    vec3 position = base.xyz;

    float value = chladni(position, uRadius);

    gl_FragColor = vec4(position, value);
}
