uniform float uThreshold;
uniform float uRadius;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;

    float distance = length(position);

    if(abs(distance - uRadius) < 0.0001) {
        // Apply color based on whether the scalar value meets the threshold
        if(abs(scalarValue) < uThreshold) {
            gl_FragColor = vec4(position, 1.0);
        } else {
            gl_FragColor = vec4(position * 0.66, 0.0);
        }
    } else {
        gl_FragColor = vec4(position * 0.66, 1.0);
    }
}
