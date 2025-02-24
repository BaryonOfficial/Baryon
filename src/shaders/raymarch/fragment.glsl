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

// New function to check for ray-sphere intersection
bool intersectSphere(vec3 ro, vec3 rd, vec3 center, float radius, out float t1, out float t2) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float discriminant = b * b - c;

    if(discriminant < 0.0)
        return false;

    float sqrtDisc = sqrt(discriminant);
    t1 = -b - sqrtDisc;
    t2 = -b + sqrtDisc;

    return true;
}

// New function to map density to color and opacity
vec4 transferFunction(float density) {
    // You can customize this function to create different visualizations
    // This creates a blue -> cyan -> white gradient
    vec3 color = mix(vec3(0.2, 0.4, 0.8), vec3(0.9, 0.9, 1.0), density);

    // Control the density of the volume
    float alpha = density * 0.15;

    return vec4(color, alpha);
}

// Replace the existing raymarch function with this volumetric version
vec4 raymarchVolume(vec3 ro, vec3 rd) {
    // Find intersection with bounding sphere
    float t_min, t_max;
    if(!intersectSphere(ro, rd, vec3(0.0), 2.0, t_min, t_max))
        return vec4(0.0);

    // Start from camera if we're inside the sphere
    t_min = max(0.0, t_min);

    // Initialize accumulated color and opacity
    vec4 result = vec4(0.0);

    // Sample step size (smaller = more detailed but slower)
    float stepSize = 0.05;

    // Number of light samples for scattering effects (optional)
    const int LIGHT_SAMPLES = 8;
    vec3 lightPos = vec3(2.0, 4.0, -3.0);

    // March through the volume
    for(float t = t_min; t < t_max && result.a < 0.95; t += stepSize) {
        vec3 p = ro + rd * t;

        // Get Chladni value at this point
        float chladniValue = chladni(p, uRadius);

        // Convert to density - this is key to how you visualize the pattern
        // Higher density where Chladni value is closer to zero
        float density = smoothstep(uThreshold, 0.0, abs(chladniValue));

        // Optional: Skip low-density regions for performance
        if(density > 0.01) {
            // Get color and alpha from transfer function
            vec4 sampleColor = transferFunction(density);

            // Optional: Add simple volumetric lighting
            vec3 lightDir = normalize(lightPos - p);
            float lightDist = length(lightPos - p);
            float lightAtten = 1.0 / (1.0 + 0.1 * lightDist + 0.01 * lightDist * lightDist);

            // Simple light scattering approximation
            float scattering = 0.0;
            for(int i = 0; i < LIGHT_SAMPLES; i++) {
                float s = float(i) / float(LIGHT_SAMPLES - 1);
                vec3 samplePos = mix(p, lightPos, s);
                float sampleChladni = chladni(samplePos, uRadius);
                float sampleDensity = smoothstep(uThreshold, 0.0, abs(sampleChladni));
                scattering += sampleDensity;
            }
            scattering = exp(-scattering * 0.2); // Adjust extinction coefficient

            // Apply lighting to sample color
            sampleColor.rgb *= (0.3 + 0.7 * lightAtten * scattering);

            // Front-to-back compositing
            sampleColor.rgb *= sampleColor.a;
            result = result + sampleColor * (1.0 - result.a);
        }
    }

    return result;
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

    // Perform volumetric ray marching instead of surface ray marching
    vec4 volumeColor = raymarchVolume(ro, rd);

    // Mix with background color (black)
    vec3 color = volumeColor.rgb;

    finalColor = vec4(color, 1.0);
}