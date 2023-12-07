self.onmessage = function(event) {
    const { particles, parameters, sphereRadius } = event.data;
    const pi = Math.PI;
    const colors = particles.color;

    
    // Chladni pattern function
    const chladni = (x, y, z, N, parameters) => {
        let sum = 0;
        for (let i=0; i < N; i++) {
        const Ai = parameters.waveComponents[i][`A${i}`]
        const ui = parameters.waveComponents[i][`u${i}`]
        const vi = parameters.waveComponents[i][`v${i}`]
        const wi = parameters.waveComponents[i][`w${i}`]
        sum += Ai * Math.sin(ui * pi * x) * Math.sin(vi * pi * y) * Math.sin(wi * pi * z)
        }
        return sum
    }

    
    // Update particle positions
    const updateParticles = (particles, parameters, sphereRadius) => {
  
    const positions = particles.position.array;
    const minWalk = 0.001;
    
    for (let i = 0; i < parameters.num; i++) {
      const i3 = i * 3;
      
        // Calculate Chladni pattern value
        let x = (positions[i3] / sphereRadius);
        let y = (positions[i3 + 1] / sphereRadius);
        let z = (positions[i3 + 2] / sphereRadius);
        let chladniValue = chladni(x, y, z, parameters.N, parameters);
        let stochasticAmplitude = parameters.v * Math.abs(chladniValue)
        
        // Ensure min movement
        stochasticAmplitude = Math.max(stochasticAmplitude, minWalk)
  
        const randomMovement1 = (Math.random() - 0.5) * stochasticAmplitude * 2;
  
        positions[i3] += randomMovement1;
        positions[i3 + 1] += randomMovement1;
        positions[i3 + 2] += randomMovement1;
     
        // Keep particles within the sphere
        const distance = Math.sqrt(positions[i3]**2 + positions[i3 + 1]**2 + positions[i3 + 2]**2)
        if (distance > sphereRadius) {
            const scale = sphereRadius /distance;
            positions[i3] *= scale
            positions[i3 + 1] *= scale
            positions[i3 + 2] *= scale
        }
    
  
    particles.position.needsUpdate = true;

    return positions;
    }
  };

    // Call updateParticles and get the updated positions
    positions = updateParticles(particles, parameters, sphereRadius);
   
    // After computations, send the updated particles back to the main thread
    self.postMessage({ 
        updatedParticles: {
          position: positions,
          color: colors,
        }
      });
  };

 