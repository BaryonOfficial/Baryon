uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform float capacity;

vec3 calculateModeNumbers(float pitch, float radius) {
    const float c = 343.0;
    float sumOfSquares = pow((2.0 * radius * pitch) / c, 2.0);

    vec3 closestModeNumbers = vec3(0.0);
    float closestDifference = sumOfSquares;

    for(int n1 = 0; n1 <= int(sqrt(sumOfSquares)); n1++) {
        for(int n2 = 0; n2 <= int(sqrt(sumOfSquares - float(n1 * n1))); n2++) {
            float remainingSquared = sumOfSquares - float(n1 * n1) - float(n2 * n2);
            if(remainingSquared >= 0.0) {
                int n3 = int(sqrt(remainingSquared));
                float sum = float(n1 * n1) + float(n2 * n2) + float(n3 * n3);
                float difference = abs(sum - sumOfSquares);

                if(difference < closestDifference) {
                    closestModeNumbers = vec3(float(n1), float(n2), float(n3));
                    closestDifference = difference;
                }
            }
        }
    }

    return closestModeNumbers;
}

// vec3 calculateModeNumbers(float pitch) {
//     const float tolerance = 0.01; // Small tolerance for floating-point comparison
//     if(abs(pitch - 261.63) < tolerance)
//         return vec3(10.0, 10.0, 2.0);
//     if(abs(pitch - 523.25) < tolerance)
//         return vec3(3.0, 5.0, 2.0);
//     if(abs(pitch - 659.25) < tolerance)
//         return vec3(7.0, 2.0, 5.0);
//     if(abs(pitch - 880.0) < tolerance)
//         return vec3(1.0, 2.0, 9.0);
//     if(abs(pitch - 1760.0) < tolerance)
//         return vec3(1.0, 2.0, 9.0);
//     return vec3(0.0); // Default case
// }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Calculate the pitch index based on the UV coordinates
    // int pitchIndex = int(uv.x * float(capacity));

    // Sample the pitch value from the tPitches texture
    // float pitch = texelFetch(tPitches, ivec2(pitchIndex, 0), 0).r;

    float pitches[6] = float[](261.63, 440.0, 523.25, 659.25, 880.0, 1760.0);

    // Calculate the index based on uv.x
    int index = int(uv.x * 6.0); // Assuming uv.x is [0, 1], scale it by the number of pitches

    // Ensure the index is within the bounds of the array
    index = clamp(index, 0, 5);

    // Set the pitch using the index
    float pitch = pitches[index];

    // // Calculate the frequency bin index for the given pitch
    // float binIndex = round(pitch * float(bufferSize) / sampleRate);

    // // Calculate the texture coordinates for the bin index
    // vec2 binUV = vec2(binIndex / float(bufferSize), 0.0);

    // // Sample the amplitude value from the tDataArray
    // float amplitude = texture2D(tDataArray, binUV).r;

    // amplitude = amplitude / 255.0;

    vec3 modeNumbers = calculateModeNumbers(pitch, uRadius);

    gl_FragColor = vec4(modeNumbers, 5.0);
}
