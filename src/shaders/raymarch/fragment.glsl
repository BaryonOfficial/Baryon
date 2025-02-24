#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURFACE_DIST 0.0001
#define MAX_N 100
#define PI 3.14159265359
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uThreshold;
uniform float uRadius;
uniform float waveComponents[4 * MAX_N];
uniform int N;
uniform vec2 uPointer;
uniform float uIsClicked;

out vec4 finalColor;

// Rotation matrix for 2D
mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

// Function to calculate the Chladni pattern displacement
float chladni(vec3 position, float radius) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;

    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];
        sum += Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    }
    return sum;
}

float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
}

float scene(vec3 p) {
    float sphereDist = sdSphere(p, 2.0);
    float chladniValue = chladni(p, uRadius);

    // Only show pattern inside sphere
    if(sphereDist > 0.0)
        return sphereDist;

    // Create surfaces where chladni pattern crosses zero
    float pattern = abs(chladniValue) - uThreshold;

    // Blend the sphere and pattern
    return max(pattern, sphereDist);
}

float raymarch(vec3 ro, vec3 rd, out vec3 p) {
    float dO = 0.0;

    for(int i = 0; i < MAX_STEPS; i++) {
        p = ro + rd * dO;
        float dS = scene(p);
        dO += dS;

        if(dO > MAX_DIST || abs(dS) < SURFACE_DIST)
            break;
    }
    return dO;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(SURFACE_DIST, 0.0);
    vec3 n = vec3(scene(p + e.xyy) - scene(p - e.xyy), scene(p + e.yxy) - scene(p - e.yxy), scene(p + e.yyx) - scene(p - e.yyx));
    return normalize(n);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);

    // Camera setup with orbital control
    vec3 ro = vec3(0.0, 0.0, 6.0);
    vec3 rd = normalize(vec3(uv, -1.5));

    // Apply accumulated rotation from pointer movement
    vec2 mouseUV = uPointer * PI * 0.5;

    // First apply Y rotation
    ro.yz *= rot2D(mouseUV.y);
    rd.yz *= rot2D(mouseUV.y);

    // Invert X rotation direction based on Y rotation angle
    float xRotationSign = sign(cos(mouseUV.y)); // Will be negative when we're "upside down"
    ro.xz *= rot2D(mouseUV.x * xRotationSign);
    rd.xz *= rot2D(mouseUV.x * xRotationSign);

    // Raymarching
    vec3 p;
    float d = raymarch(ro, rd, p);
    vec3 color = vec3(0.0); // Black background

    if(d < MAX_DIST) {
        vec3 normal = getNormal(p);
        vec3 lightPos = vec3(2.0, 4.0, -3.0);
        vec3 lightDir = normalize(lightPos - p);

        // Lighting calculations
        float diff = max(dot(normal, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, normal), -rd), 0.0), 32.0);
        float rim = 1.0 - max(dot(normal, -rd), 0.0);
        rim = pow(rim, 3.0);

        // Base color with lighting
        vec3 baseColor = vec3(0.99, 0.94, 0.89);
        color = baseColor * (diff * 0.7 + 0.3); // Diffuse + ambient
        color += spec * 0.5; // Specular
        color += rim * 0.3 * baseColor; // Rim light

        // Add subtle animation to the color based on time
        color *= 1.0 + 0.1 * sin(uTime * 0.5);
    }

    finalColor = vec4(color, 1.0);
}