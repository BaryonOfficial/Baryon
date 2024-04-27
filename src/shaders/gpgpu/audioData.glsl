#include ../includes/random2D.glsl
#define MAX_N 20

uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform int capacity;
uniform float uRandomPitches[MAX_N];

// vec3 calculateModeNumbers(float pitch, float radius) {
//     const float c = 343.0;
//     float sumOfSquares = pow((2.0 * radius * pitch) / c, 2.0);

//     vec3 closestModeNumbers = vec3(0.0);
//     float closestDifference = sumOfSquares;

//     for(int n1 = 0; n1 <= int(sqrt(sumOfSquares)); n1++) {
//         for(int n2 = 0; n2 <= int(sqrt(sumOfSquares - float(n1 * n1))); n2++) {
//             float remainingSquared = sumOfSquares - float(n1 * n1) - float(n2 * n2);
//             if(remainingSquared >= 0.0) {
//                 int n3 = int(sqrt(remainingSquared));
//                 float sum = float(n1 * n1) + float(n2 * n2) + float(n3 * n3);
//                 float difference = abs(sum - sumOfSquares);

//                 if(difference < closestDifference) {
//                     closestModeNumbers = vec3(float(n1), float(n2), float(n3));
//                     closestDifference = difference;
//                 }
//             }
//         }
//     }

//     // Round the mode numbers to the nearest integer
//     closestModeNumbers = round(closestModeNumbers);

//     return closestModeNumbers;
// }

vec3 calculateModeNumbers(float pitch, float radius) {
    const float c = 343.0;
    float sumOfSquares = pow((2.0 * radius * pitch) / c, 2.0);

    vec3 closestModeNumbers[3];
    float closestDifferences[3];

    for(int i = 0; i < 3; i++) {
        closestModeNumbers[i] = vec3(0.0);
        closestDifferences[i] = sumOfSquares;
    }

    for(int n1 = 0; n1 <= int(sqrt(sumOfSquares)); n1++) {
        for(int n2 = 0; n2 <= int(sqrt(sumOfSquares - float(n1 * n1))); n2++) {
            float remainingSquared = sumOfSquares - float(n1 * n1) - float(n2 * n2);
            if(remainingSquared >= 0.0) {
                int n3 = int(sqrt(remainingSquared));
                float sum = float(n1 * n1) + float(n2 * n2) + float(n3 * n3);
                float difference = abs(sum - sumOfSquares);

                for(int i = 0; i < 3; i++) {
                    if(difference < closestDifferences[i]) {
                        for(int j = 2; j > i; j--) {
                            closestModeNumbers[j] = closestModeNumbers[j - 1];
                            closestDifferences[j] = closestDifferences[j - 1];
                        }
                        closestModeNumbers[i] = vec3(float(n1), float(n2), float(n3));
                        closestDifferences[i] = difference;
                        break;
                    }
                }
            }
        }
    }

    // Randomly select one of the three closest mode numbers
    int randomIndex = int(random2D(gl_FragCoord.xy) * 3.0);
    vec3 selectedModeNumbers = closestModeNumbers[randomIndex];

    // Round the selected mode numbers to the nearest integer
    selectedModeNumbers = round(selectedModeNumbers);

    return selectedModeNumbers;
}

float generateRandomAmplitude(float pitch) {
    return random2D(gl_FragCoord.xy + vec2(pitch));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    int pitchIndex = int(uv.x * float(capacity));
    float pitch = uRandomPitches[pitchIndex];
    // float amplitude = generateRandomAmplitude(pitch);
    // amplitude = amplitude / 255.0;

    // // // Calculate the texture coordinates based on the index
    // float index = uv.x * float(capacity);
    // float textureWidth = float(textureSize(tPitches, 0).x);
    // float textureCoord = index / textureWidth;

    // // // // Sample the pitch value from the tPitches texture
    // float pitch = texture(tPitches, vec2(textureCoord, 0.5)).r;

    vec3 modeNumbers = calculateModeNumbers(pitch, uRadius);

    gl_FragColor = vec4(modeNumbers, 10.0);

}
