uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;
uniform int nNotes;

uniform float sampleRate;
uniform float bufferSize;

int solveMode(float length, float rightSide) {

    const float maxError = 0.01;
    const int maxIterations = 100;
    int left = 0;
    int right = int(rightSide * length);

    for(int i = 0; i < maxIterations; i++) {
        int mid = (left + right) / 2;
        float midSquared = float(mid * mid) / (length * length);

        if(abs(midSquared - rightSide * rightSide) < maxError) {
            return mid;
        }

        if(midSquared < rightSide * rightSide) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    return -1; // No solution found within the specified error tolerance
}

vec3 calculateModeNumbers(float pitch) {
    float l1 = uRadius;
    float l2 = uRadius;
    float l3 = uRadius;
    const float c = 343.0;
    float rightSide = (2.0 * pitch) / c;

    int n1 = solveMode(l1, rightSide);
    if(n1 < 0) {
        return vec3(-1.0);
    }

    float remainingSquared = rightSide * rightSide - float(n1 * n1) / (l1 * l1);
    if(remainingSquared < 0.0) {
        return vec3(-1.0);
    }

    int n2 = solveMode(l2, sqrt(remainingSquared));
    if(n2 < 0) {
        return vec3(-1.0);
    }

    remainingSquared -= float(n2 * n2) / (l2 * l2);
    if(remainingSquared < 0.0) {
        return vec3(-1.0);
    }

    int n3 = solveMode(l3, sqrt(remainingSquared));
    if(n3 < 0) {
        return vec3(-1.0);
    }

    return vec3(float(n1), float(n2), float(n3));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float pitch = texture2D(tPitches, vec2(uv.x, 0.0)).r;

    // Calculate the bin index for the given pitch
    float binIndex = round(pitch * bufferSize / sampleRate);

    // Calculate the texture coordinates for the bin index
    vec2 binUV = vec2(binIndex / bufferSize, 0.5);

    // Sample the amplitude value from the tDataArray
    float amplitude = texture2D(tDataArray, binUV).r;

    // Normalize amplitude to [0, 1]
    amplitude = amplitude / 255.0;

    vec3 modeNumbers = calculateModeNumbers(pitch);
    gl_FragColor = vec4(amplitude, modeNumbers);
}
