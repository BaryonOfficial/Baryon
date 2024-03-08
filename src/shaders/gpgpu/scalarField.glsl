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

   // Calculate the slice index and interpolation factor
    float sliceIndex = floor(uv.x * uSliceCount);
    float sliceInterpolation = fract(uv.x * uSliceCount);

    // Calculate the depth of the current slice
    float depth = (sliceIndex + sliceInterpolation) / uSliceCount;

    // Calculate the spherical coordinates
    float phi = uv.y * PI;
    float theta = depth * 2.0 * PI;
    float r = pow(uv.y, 1.0 / 3.0) * uRadius;

    // Calculate the 3D position within the volume using spherical coordinates
    vec3 position;
    position.x = r * sin(phi) * cos(theta);
    position.y = r * sin(phi) * sin(theta);
    position.z = r * cos(phi);
    float value = chladni(position);

    gl_FragColor = vec4(position, value);
}
