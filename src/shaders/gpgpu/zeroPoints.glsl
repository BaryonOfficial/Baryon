uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;
    float distance = length(position);

    vec3 scaledPosition = (position) * 0.75;

    if(abs(scalarValue) < uThreshold) {
        if(abs(distance - uRadius) < uSurfaceThreshold) {
            // ZeroPoint is on the surface
            gl_FragColor = vec4(position, 1.0);
        } else {
            // ZeroPoint is in the volume
            gl_FragColor = vec4(scaledPosition, 2.0);
        }
    } else {
        // if(abs(distance - uRadius) < uSurfaceThreshold) {
        //     // Point is on the surface but not a zero point
        //     gl_FragColor = vec4(scaledPosition, 0.0);  // Example color, adjust as needed
        // } else {
        //     // // Point is in the volume but not a zero point
        //     // gl_FragColor = vec4(scaledPosition, 0.0);
        //     discard;
        // }
        discard;
    }
}
