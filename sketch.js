let song;
let fft;
let particles = [];
const NUM_PARTICLES = 6144 ; // Increased particle count
const FLOW_RESOLUTION = 5;
let flowfield = [];

function preload() {
    song = loadSound('media_assets/tvari_tokyo_cafe.mp3');
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    colorMode(HSB, 360, 100, 100, 1);  // Set color mode to HSB
    background(0);
    song.loop();
    
    fft = new p5.FFT();

    // Initialize particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push(new Particle(random(width), random(height)));
    }

    // Add an event listener to the start button
    let startButton = document.getElementById('startButton');
    startButton.addEventListener('click', function() {
        song.loop();
        startButton.style.display = 'none'; // Hide the button
    });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
    background(0, 0, 0, 0.1);  // Add a bit of alpha for trails

    // Analyze the audio's frequency spectrum
    let spectrum = fft.analyze();
    
    // Get dominant frequency
    let dominantFrequency = getDominantFrequency(spectrum);

    // Update flow field based on dominant frequency
    updateFlowField(dominantFrequency);

    // Update and display particles
    for (let p of particles) {
        let x = constrain(floor(p.pos.x / FLOW_RESOLUTION), 0, flowfield.length - 1);
        let y = constrain(floor(p.pos.y / FLOW_RESOLUTION), 0, flowfield[0].length - 1);
        let v = flowfield[x][y];
        let hue = map(v.heading(), -PI, PI, 0, 360);  // Map vector direction to hue
        p.applyForce(v);
        p.update();
        p.display(hue);
    }
}


function getDominantFrequency(spectrum) {
    return spectrum.indexOf(Math.max(...spectrum));
}

function updateFlowField(frequency) {
    let rows = floor(width / FLOW_RESOLUTION);
    let cols = floor(height / FLOW_RESOLUTION);
    for (let x = 0; x < rows; x++) {
        flowfield[x] = [];
        for (let y = 0; y < cols; y++) {
            let val = cymaticsFunction(x / rows * 2 - 1, y / cols * 2 - 1, frequency % 10, (frequency + 2) % 10);
            let v = p5.Vector.fromAngle(val * TWO_PI);
            flowfield[x][y] = v;
        }
    }
}

function cymaticsFunction(x, z, n, m) {
    return Math.cos(n * x * Math.PI) * Math.cos(m * z * Math.PI) - Math.cos(m * x * Math.PI) * Math.cos(n * z * Math.PI);
}
class Particle {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.prevPos = this.pos.copy(); // Store the previous position
        this.vel = createVector(0, 0);
        this.acc = createVector(0, 0);
        this.maxSpeed = 6;
    }

    applyForce(force) {
        this.acc.add(force);
    }

    update() {
        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.prevPos = this.pos.copy(); // Before updating the position, save it as the previous position
        this.pos.add(this.vel);
        this.acc.mult(0);

        // Boundary conditions
        if (this.pos.x > width) this.pos.x = 0;
        if (this.pos.x < 0) this.pos.x = width;
        if (this.pos.y > height) this.pos.y = 0;
        if (this.pos.y < 0) this.pos.y = height;
    }

    display(hue) {
    strokeWeight(2);
    stroke(hue, 100, 100);
    
    // Calculate the distance between the current and previous position
    let d = dist(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
    
    // If the distance is less than a certain threshold (e.g., 50 pixels), draw the line
    if (d < 50) {
        line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
    }
}

}

