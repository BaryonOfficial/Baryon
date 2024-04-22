uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform float capacity;

vec3 calculateModeNumbers(float frequency, float radius) {
    const float c = 343.0;
    float sumOfSquares = pow((2.0 * radius * frequency) / c, 2.0);

    for(int n1 = 0; n1 <= int(sqrt(sumOfSquares)); n1++) {
        for(int n2 = 0; n2 <= int(sqrt(sumOfSquares - float(n1 * n1))); n2++) {
            float remainingSquared = sumOfSquares - float(n1 * n1) - float(n2 * n2);
            if(remainingSquared >= 0.0) {
                int n3 = int(sqrt(remainingSquared));
                if(float(n1 * n1) + float(n2 * n2) + float(n3 * n3) == sumOfSquares) {
                    return vec3(float(n1), float(n2), float(n3));
                }
            }
        }
    }
    // No valid mode numbers found
    return vec3(0.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Calculate the pitch index based on the UV coordinates
    int pitchIndex = int(uv.x * float(capacity));

    // Sample the pitch value from the tPitches texture
    float pitch = texelFetch(tPitches, ivec2(pitchIndex, 0), 0).r;

    // Calculate the frequency bin index for the given pitch
    float binIndex = round(pitch * float(capacity) / sampleRate);

    // Calculate the texture coordinates for the bin index
    vec2 binUV = vec2(binIndex / float(capacity), 0.0);

    // Sample the amplitude value from the tDataArray
    float amplitude = texture2D(tDataArray, binUV).r;

    // Normalize amplitude to [0, 1]
    amplitude = amplitude / 255.0;

    vec3 modeNumbers = calculateModeNumbers(pitch, uRadius);

    gl_FragColor = vec4(1.0, 10.0, 10.0, 10.0);
}
