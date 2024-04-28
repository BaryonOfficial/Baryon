#include ../includes/random2D.glsl
#define MAX_N 20

uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform int capacity;
uniform float uRandomPitches[MAX_N];

const float c = 343.0;
const float accuracy = 0.1;

float objectiveFunction(float n, float pitch) {
    return (c / (2.0 * uRadius)) * sqrt(n * n) - pitch;
}

float bisection(float lower, float upper, float pitch) {
    while(upper - lower > accuracy) {
        float midpoint = (lower + upper) / 2.0;
        if(objectiveFunction(midpoint, pitch) == 0.0) {
            return midpoint;
        } else if(objectiveFunction(lower, pitch) * objectiveFunction(midpoint, pitch) < 0.0) {
            upper = midpoint;
        } else {
            lower = midpoint;
        }
    }
    return (lower + upper) / 2.0;
}

vec3 calculateModeNumbers(float pitch) {
    float n1 = bisection(0.0, pitch * uRadius / c, pitch);
    float n2 = bisection(0.0, sqrt(2.0) * pitch * uRadius / c, pitch);
    float n3 = bisection(0.0, sqrt(3.0) * pitch * uRadius / c, pitch);

    return round(vec3(n1, n2, n3));
}

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

    vec3 modeNumbers = calculateModeNumbers(pitch);

    gl_FragColor = vec4(modeNumbers, amplitude);

}
