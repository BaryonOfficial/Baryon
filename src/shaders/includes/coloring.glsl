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