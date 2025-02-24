#include ../includes/rot2D.glsl
#include ../includes/sdSphere.glsl
precision mediump float;

#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURFACE_DIST 0.0001
#define MAX_N 100
#define PI 3.14159265359

uniform float uTime;
uniform vec2 uResolution;
uniform float uThreshold;
uniform float uRadius;
uniform float waveComponents[4 * MAX_N];
uniform int N;
uniform vec2 uPointer;
uniform float uIsClicked;
uniform float uZoom;

out vec4 finalColor;

// Function to calculate the Chladni pattern displacement
float chladni(vec3 position, float radius) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;
    float piScaled = PI * scaleFactor;

    // Precalculate scaled position components
    float px = position.x * piScaled;
    float py = position.y * piScaled;
    float pz = position.z * piScaled;

    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];

        // Calculate each sin term once
        float sinX = sin(ui * px);
        float sinY = sin(vi * py);
        float sinZ = sin(wi * pz);

        sum += Ai * sinX * sinY * sinZ;
    }
    return sum;
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
    float stepSize = 0.04;

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

    // Camera setup with orbital control and zoom
    vec3 ro = vec3(0.0, 0.0, 6.0 / uZoom);
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

    // Calculate holographic effect - we'll enhance the existing pattern, not replace it
    float holographic = 0.0;

    // Get the first intersection with the bounding sphere for holographic effect
    float t_min, t_max;
    if(intersectSphere(ro, rd, vec3(0.0), 2.0, t_min, t_max)) {
        // Start from camera if we're inside the sphere
        t_min = max(0.0, t_min);

        // Sample a few points along the ray for holographic effect
        const int HOLO_SAMPLES = 5;
        for(int i = 0; i < HOLO_SAMPLES; i++) {
            float t = mix(t_min, t_max, float(i) / float(HOLO_SAMPLES - 1));
            vec3 p = ro + rd * t;

            // Calculate the Chladni value at this point
            float chladniValue = chladni(p, uRadius);

            // Only contribute to holographic effect near the Chladni pattern surface
            if(abs(chladniValue) < uThreshold * 2.0) {
                // Stripes based on position and time
                float stripes = mod((p.y - uTime * 0.02) * 20.0, 1.0);
                stripes = pow(stripes, 3.0);

                // Fresnel-like effect based on view direction and normal approximation
                // Since we don't have a true normal in the volume, use gradient of Chladni field
                vec2 e = vec2(0.01, 0.0);
                vec3 grad = vec3(chladni(p + e.xyy, uRadius) - chladni(p - e.xyy, uRadius), chladni(p + e.yxy, uRadius) - chladni(p - e.yxy, uRadius), chladni(p + e.yyx, uRadius) - chladni(p - e.yyx, uRadius));
                vec3 normal = normalize(grad);

                float fresnel = abs(dot(rd, normal));
                fresnel = 1.0 - fresnel; // Invert for edge glow
                fresnel = pow(fresnel, 2.0);

                // Falloff
                float falloff = smoothstep(0.0, 0.8, fresnel);

                // Combine effects
                float sampleHolo = fresnel * stripes;
                sampleHolo += fresnel * 0.75; // Reduced to prevent over-brightening
                sampleHolo *= falloff;

                // Weight by proximity to Chladni surface
                float weight = smoothstep(uThreshold, 0.0, abs(chladniValue));
                holographic += sampleHolo * weight;
            }
        }

        // Normalize based on samples
        holographic /= float(HOLO_SAMPLES);

        // Boost the holographic effect for better visibility
        holographic *= 2.0;
    }

    // For additive/transparent blending:
    // 1. Keep original color but potentially enhance it slightly with holographic effect
    // 2. Use a proper alpha value that works well with Three.js blending modes

    // Use volumeColor.a for the pattern's actual density
    float alpha = volumeColor.a;

    // Add a subtle color shift based on holographic effect (optional)
    vec3 finalRGB = color + vec3(0.1, 0.2, 0.3) * holographic;

    // When used with THREE.AdditiveBlending, the alpha controls the intensity
    // For adding glow only where patterns exist
    float finalAlpha = alpha + holographic * 0.5 * alpha;

    // Output the final color
    finalColor = vec4(finalRGB, finalAlpha);
}