uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform float capacity;

// vec3 calculateModeNumbers(float frequency, float radius) {
//     const float c = 343.0;
//     float sumOfSquares = pow((2.0 * radius * frequency) / c, 2.0);

//     for(int n1 = 0; n1 <= int(sqrt(sumOfSquares)); n1++) {
//         for(int n2 = 0; n2 <= int(sqrt(sumOfSquares - float(n1 * n1))); n2++) {
//             float remainingSquared = sumOfSquares - float(n1 * n1) - float(n2 * n2);
//             if(remainingSquared >= 0.0) {
//                 int n3 = int(sqrt(remainingSquared));
//                 if(float(n1 * n1) + float(n2 * n2) + float(n3 * n3) == sumOfSquares) {
//                     return vec3(float(n1), float(n2), float(n3));
//                 }
//             }
//         }
//     }
//     // No valid mode numbers found
//     return vec3(1.0);
// }

vec3 calculateModeNumbers(float frequency, float radius) {
    // Return different values based on frequency for testing
    if(frequency == 440.0)
        return vec3(1.0, 10.0, 2.0);
    if(frequency == 523.25)
        return vec3(3.0, 1.0, 2.0);
    if(frequency == 659.25)
        return vec3(1.0, 2.0, 3.0);
    return vec3(1.0); // Default case
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Calculate the pitch index based on the UV coordinates
    // int pitchIndex = int(uv.x * float(capacity));

    // Sample the pitch value from the tPitches texture
    // float pitch = texelFetch(tPitches, ivec2(pitchIndex, 0), 0).r;

         // Manually set pitch values for testing
    float pitch;
    if(uv.x < 0.33) {
        pitch = 440.0; // A4 note
    } else if(uv.x < 0.66) {
        pitch = 523.25; // C5 note
    } else {
        pitch = 659.25; // E5 note
    }

    // Calculate the frequency bin index for the given pitch
    float binIndex = round(pitch * float(capacity) / sampleRate);

    // Calculate the texture coordinates for the bin index
    vec2 binUV = vec2(binIndex / float(capacity), 0.0);

    // Sample the amplitude value from the tDataArray
    float amplitude = texture2D(tDataArray, binUV).r;

    // Normalize amplitude to [0, 1]
    amplitude = amplitude / 255.0;

    vec3 modeNumbers = calculateModeNumbers(pitch, uRadius);

    gl_FragColor = vec4(modeNumbers, 1.0);
}
