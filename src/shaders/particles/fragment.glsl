// varying vec3 vColor;
varying float vType;

void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    if(distanceToCenter > 0.5)
        discard;

    vec3 color;
    if(vType == 1.0) {
        // Surface particle, assign the desired color (e.g., red)
        color = vec3(0.0, 0.78, 0.25);
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