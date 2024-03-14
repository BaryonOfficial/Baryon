#define MAX_N 100
#define PI 3.14159265359

// Function params
uniform sampler2D uBase;
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
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 base = texture(uBase, uv);
    vec3 position = base.xyz;

    float value = chladni(position);

    // Debug: Output the calculated Chladni displacement value
    // gl_FragColor = vec4(value, value, value, 1.0);

    gl_FragColor = vec4(base.xyz, value);
}
