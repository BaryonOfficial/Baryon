 vec3 Strand(in vec2 fragCoord, in vec3 color, in float hoffset, in float hscale, in float vscale)
{
    float glow = 0.04 * iResolution.y;
    float twopi = 6.28318530718;
    // Removed the time-dependent part from the curve calculation
    float curve = 1.0 - abs(fragCoord.y - (sin(fragCoord.x * hscale / 100.0 / iResolution.x * 1000.0 + hoffset) * iResolution.y * 0.25 * vscale + iResolution.y / 2.0));
    float i = clamp(curve, 0.0, 1.0);
    i += clamp((glow + curve) / glow, 0.0, 1.0) * 0.4 ;
    return i * color;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float timescale = 4.0;
    vec3 c = vec3(0, 0, 0);
    c += Strand(fragCoord, vec3(1.0, 0, 0), 0.7934 + 1.0, 1.0, 0.16);
    c += Strand(fragCoord, vec3(0.0, 1.0, 0.0), 0.645 + 1.0, 1.5, 0.2);
    c += Strand(fragCoord, vec3(0.0, 0.0, 1.0), 0.735 + 1.0, 1.3, 0.19);
    c += Strand(fragCoord, vec3(1.0, 1.0, 0.0), 0.9245 + 1.0, 1.6, 0.14);
    c += Strand(fragCoord, vec3(0.0, 1.0, 1.0), 0.7234 + 1.0, 1.9, 0.23);
    c += Strand(fragCoord, vec3(1.0, 0.0, 1.0), 0.84525 + 1.0, 1.2, 0.18);
    fragColor = vec4(c.r, c.g, c.b, 1.0);
}

