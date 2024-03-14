#define MAX_N 100
#define PI 3.14159265359

// Function params
uniform float waveComponents[4 * MAX_N];
uniform int N;
uniform float uRadius;
uniform sampler2D uBase;

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
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 base = texture(uBase, uv);
    vec3 position = base.xyz;

    // Debug: Output the sampled position
    // gl_FragColor = vec4(position, 1.0);

    float value = chladni(position);

    gl_FragColor = vec4(position, value);
}
