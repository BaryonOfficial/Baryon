varying vec3 vColor;
varying float vType;
varying vec3 vPosition;
uniform float uTime;

float hue2rgb(float p, float q, float t) {
    if(t < 0.0)
        t += 1.0;
    if(t > 1.0)
        t -= 1.0;
    if(t < 1.0 / 6.0)
        return p + (q - p) * 6.0 * t;
    if(t < 1.0 / 2.0)
        return q;
    if(t < 2.0 / 3.0)
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

vec3 hslToRgb(float h, float s, float l) {
    vec3 rgb;

    if(s == 0.0) {
        rgb = vec3(l);
    } else {

        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        rgb.r = hue2rgb(p, q, h + 1.0 / 3.0);
        rgb.g = hue2rgb(p, q, h);
        rgb.b = hue2rgb(p, q, h - 1.0 / 3.0);
    }

    return rgb;
}

void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    if(distanceToCenter > 0.5)
        discard;

    vec3 color;
    if(vType == 1.0) {

        // Repeated gradient
        float hue = abs(vPosition.y) * 0.8; // Map vertical position to hue range [0, 0.8]
        float period = 10.0; // Example: cycle every 10 seconds
        hue += (mod(uTime, period) / period) * 0.8;

        hue = mod(hue, 0.8); // Wrap hue around the range [0, 0.8]
        color = hslToRgb(hue, 1.0, 0.5);

    } else if(vType == 0.0) {
        // Scaled-back particle, assign a different color (e.g., blue)
        color = vec3(1.0);
    } else if(vType == 0.5) {
        color = vec3(0.0);
    }

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}