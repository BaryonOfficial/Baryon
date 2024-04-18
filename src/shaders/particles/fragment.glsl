varying vec3 vColor;
varying float vGroup;
varying vec3 vPosition;
uniform float uTime;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uRadius;

void main() {
    // Creates circles
    float distanceToCenter = length(gl_PointCoord - 0.5);
    if(distanceToCenter > 0.5)
        discard;

    //******* Holographic Effect *******//

    vec3 normal = normalize(vNormal);
    normal = gl_FrontFacing ? normal : -normal;

    // Stripes
    float stripes = mod((vPosition.y - uTime * 0.02) * 20.0, 1.0);
    stripes = pow(stripes, 3.0);

    // Fresnel
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    float fresnel = 1.0 - dot(viewDirection, normal);
    fresnel = pow(fresnel, 2.0);

    vec3 holographicColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), fresnel);

    // Falloff
    float falloff = smoothstep(0.8, 0.0, fresnel);

    // Holographic
    float holographic = fresnel * stripes;
    holographic += fresnel * 5.25;
    holographic *= falloff;

    // ***** Coloring ***** //
    vec3 color;
    if(vGroup == 1.0) {
        color = vec3(0.87059, 0.93333, 0.98039);
    } else if(vGroup == 2.0) {
        // Scaled back
        color = uColor;
    } else if(vGroup == 0.0) {
        color = vec3(0.35686, 0.57255, 0.96078);
    }

    float alpha = 1.0;
    vec3 finalColor = mix(color, holographicColor, holographic);
    gl_FragColor = vec4(finalColor, alpha);
    // gl_FragColor = vec4(color, holographic);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}