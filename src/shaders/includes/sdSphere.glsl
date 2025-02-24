// Signed distance function for a sphere
float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
}