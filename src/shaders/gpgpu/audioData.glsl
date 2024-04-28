#include ../includes/random2D.glsl
#define MAX_N 20

uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform int capacity;
uniform float uRandomPitches[MAX_N];

// Secant Method
ivec3 findNormalModes(float pitch) {
    float c = 340.0; // Speed of sound in air (m/s)
    float l = uRadius;
    float uTolerance = 0.01;
    int uMaxIterations = 200;

    // Initial guess for n1, n2, n3
    ivec3 n0 = ivec3(1);
    ivec3 n1 = ivec3(2);

    for(int i = 0; i < uMaxIterations; i++) {
        // Compute frequencies for current guesses
        float v0 = 0.5 * c * sqrt(float(n0.x * n0.x + n0.y * n0.y + n0.z * n0.z) / (l * l));
        float v1 = 0.5 * c * sqrt(float(n1.x * n1.x + n1.y * n1.y + n1.z * n1.z) / (l * l));

        // Check for convergence
        if(abs(v1 - pitch) < uTolerance) {
            break;
        }

        // Prevent division by zero
        if(abs(v1 - v0) < 0.0001) {
            break;
        }

        // Compute next guess using secant method
        vec3 n2 = vec3(n1) - (v1 - pitch) * (vec3(n1) - vec3(n0)) / (v1 - v0);

        // Round the next guess to the nearest integer
        n1 = ivec3(round(n2));

        // Update n0 for the next iteration
        n0 = n1;
    }

    return n1;
}

// Bisection Method
// float objectiveFunction(float n, float pitch) {
//     return (c / (2.0 * uRadius)) * sqrt(n * n) - pitch;
// }

// float bisection(float lower, float upper, float pitch) {
//     while(upper - lower > accuracy) {
//         float midpoint = (lower + upper) / 2.0;
//         if(objectiveFunction(midpoint, pitch) == 0.0) {
//             return midpoint;
//         } else if(objectiveFunction(lower, pitch) * objectiveFunction(midpoint, pitch) < 0.0) {
//             upper = midpoint;
//         } else {
//             lower = midpoint;
//         }
//     }
//     return (lower + upper) / 2.0;
// }

// vec3 calculateModeNumbers(float pitch) {
//     float n1 = bisection(0.0, pitch * uRadius / c, pitch);
//     float n2 = bisection(0.0, sqrt(2.0) * pitch * uRadius / c, pitch);
//     float n3 = bisection(0.0, sqrt(3.0) * pitch * uRadius / c, pitch);

//     return round(vec3(n1, n2, n3));
// }

float frequencyToIndex(float pitch) {
    float nyquist = sampleRate / 2.0;

    return (pitch / nyquist) * (bufferSize / 2.0);
}

// float generateRandomAmplitude(float pitch) {
//     return random2D(gl_FragCoord.xy + vec2(pitch));
// }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // int pitchIndex = int(uv.x * float(capacity));
    // float pitch = uRandomPitches[pitchIndex];
    // float amplitude = generateRandomAmplitude(pitch);
    // amplitude = amplitude / 255.0;

    // Calculate the texture coordinates based on the index
    float index = uv.x * float(capacity);
    float textureWidth = float(textureSize(tPitches, 0).x);
    float textureCoord = index / textureWidth;

    // Sample the pitch value from the tPitches texture
    float pitch = texture(tPitches, vec2(textureCoord, 0.5)).r;
    float index2 = frequencyToIndex(pitch);
    // Normalize the index to the range [0, 1]
    float normalizedIndex = clamp(index2 / (bufferSize / 2.0), 0.0, 1.0); // Clamping to avoid out-of-bounds

    // Sample the amplitude from the frequency data texture
    float amplitude = texture(tDataArray, vec2(normalizedIndex, 0.5)).r;

    ivec3 modeNumbers = findNormalModes(pitch);

    gl_FragColor = vec4(vec3(modeNumbers), amplitude);

}
