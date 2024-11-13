#include ../includes/random2D.glsl
#define MAX_N 20

uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform int capacity;
uniform float uRandomPitches[MAX_N];

const float SOUND_SPEED_AIR = 340.0;
// const float SOUND_SPEED_WATER = 1480.0;
const float TOLERANCE = 1.0;
const int MAX_ITERATIONS = 200;

// Secant Method
ivec3 findNormalModesSecant(float pitch) {
    float c = SOUND_SPEED_AIR;
    float l = uRadius;
    float invL2 = 1.0 / (l * l);

    ivec3 n0 = ivec3(1);
    ivec3 n1 = ivec3(2);

    for(int i = 0; i < MAX_ITERATIONS; i++) {
        vec3 n0Vec = vec3(n0);
        vec3 n1Vec = vec3(n1);

        float v0 = 0.5 * c * sqrt(dot(n0Vec, n0Vec) * invL2);
        float v1 = 0.5 * c * sqrt(dot(n1Vec, n1Vec) * invL2);

        if(abs(v1 - pitch) < TOLERANCE || abs(v1 - v0) < 0.0001) {
            break;
        }

        vec3 n2 = n1Vec - (v1 - pitch) * (n1Vec - n0Vec) / (v1 - v0);
        n1 = ivec3(round(n2));
        n0 = n1;
    }

    return n1;
}

// Fallback bisection method for when secant method fails
float objectiveFunction(float n, float pitch) {
    float c = SOUND_SPEED_AIR;
    return (c / (2.0 * uRadius)) * sqrt(n * n) - pitch;
}

float bisection(float lower, float upper, float pitch) {
    for(int i = 0; i < MAX_ITERATIONS; i++) {
        float midpoint = (lower + upper) / 2.0;
        float fMid = objectiveFunction(midpoint, pitch);

        if(abs(fMid) < TOLERANCE)
            return midpoint;

        if(objectiveFunction(lower, pitch) * fMid < 0.0)
            upper = midpoint;
        else
            lower = midpoint;
    }
    return (lower + upper) / 2.0;
}

ivec3 findNormalModesFallback(float pitch) {
    float c = SOUND_SPEED_AIR;
    float n1 = bisection(0.0, pitch * uRadius / c, pitch);
    float n2 = bisection(0.0, sqrt(2.0) * pitch * uRadius / c, pitch);
    float n3 = bisection(0.0, sqrt(3.0) * pitch * uRadius / c, pitch);
    return ivec3(round(vec3(n1, n2, n3)));
}

// Main normal modes function with fallback
ivec3 findNormalModes(float pitch) {
    // Try secant method first
    ivec3 result = findNormalModesSecant(pitch);

    // If any component is unreasonable (e.g., too large or negative), use bisection
    if(any(greaterThan(result, ivec3(100))) || any(lessThan(result, ivec3(0))))
        return findNormalModesFallback(pitch);

    return result;
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

    // Calculate the texture coordinates based on the index dynamically
    float index = uv.x * float(capacity);
    float textureWidth = float(textureSize(tPitches, 0).x);
    float textureCoord = index / textureWidth;

    // Sample pitch using calculated coordinates
    float pitch = texture(tPitches, vec2(textureCoord, 0.5)).r;

    // Random Pitches for Testing
    // int pitchIndex = int(uv.x * float(capacity));
    // float pitch = uRandomPitches[pitchIndex];
    // float amplitude = generateRandomAmplitude(pitch);
    // amplitude = amplitude / 255.0;

    // Calculate frequency index for amplitude sampling
    float index2 = frequencyToIndex(pitch);
    float normalizedIndex = clamp(index2 / (bufferSize / 2.0), 0.0, 1.0); // Clamping to avoid out-of-bounds

    // Sample the amplitude from the frequency data texture
    float amplitude = texture(tDataArray, vec2(normalizedIndex, 0.5)).r;

    ivec3 modeNumbers = findNormalModes(pitch);

    gl_FragColor = vec4(vec3(modeNumbers), amplitude);

}
