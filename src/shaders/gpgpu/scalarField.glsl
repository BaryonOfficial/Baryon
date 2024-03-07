#define MAX_N 100
#define PI 3.14159265359

// Function params
uniform float waveComponents[4 * MAX_N];
uniform int N;
uniform float uRadius;
uniform vec2 scalarFieldResolution;
uniform float uDepth;
uniform float uSliceCount;

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

    // Calculate the 3D texture coordinates
    float sliceIndex = floor(uv.x * uSliceCount);
    float sliceOffset = fract(uv.x * uSliceCount);
    float theta = uv.y * PI;

    // Calculate the 3D position within the volume
    float radius = sqrt(1.0 - uv.y * uv.y) * uRadius;
    float x = cos(sliceIndex / uSliceCount * 2.0 * PI) * radius;
    float y = sin(sliceIndex / uSliceCount * 2.0 * PI) * radius;
    float z = uv.y * uRadius;

    vec3 position = vec3(x, y, z);

    // Calculate the scalar field value at the 3D position using the chladni function
    float value = chladni(position);

    gl_FragColor = vec4(position, value);
}
