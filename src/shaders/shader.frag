#define MAX_STEPS 50
#define MAX_DIST 100.0
#define SURFACE_DIST 0.001
#define MAX_N 100
#define PI 3.14159265359
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCameraPos;

uniform float waveComponents[4 * MAX_N];
uniform int N;

out vec4 finalColor; // Define an output variable for the fragment shader

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

float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
}

float scene(vec3 p) {
    float distance = sdSphere(p, 1.0);
    return distance;
}

// float scene(vec3 p) {
//     float chladniValue = chladni(p);
//     return abs(chladniValue);
// }

float raymarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    vec3 color = vec3(0.0);

    for(int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = scene(p);

        dO += dS;

        if(dO > MAX_DIST || dS < SURFACE_DIST) {
            break;
        }
    }
    return dO;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(.01, 0);

    vec3 n = scene(p) - vec3(scene(p - e.xyy), scene(p - e.yxy), scene(p - e.yyx));

    return normalize(n);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    uv -= 0.5;
    uv.x *= uResolution.x / uResolution.y;

    // Ray Origin - camera
    vec3 ro = uCameraPos;

    // Ray Direction
    vec3 rd = normalize(vec3(uv, -1.0));

    // Raymarching
    float d = raymarch(ro, rd);
    vec3 p = ro + rd * d;

    vec3 color = vec3(0.0);

    if(d < MAX_DIST) {
        color = vec3(1.0, 1.0, 1.0);
    }

    finalColor = vec4(color, 1.0);
}
