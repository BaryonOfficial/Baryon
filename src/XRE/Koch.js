import * as THREE from 'three'

function create3DKochFractal(scene, fractalQueue, iterations, length, start, end, color, directions) {
    if (iterations === 0) {
        if (!color) {
            color = new THREE.Color("black");
        }
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({ color: color });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        return;
    }

    const direction = end.clone().sub(start).normalize();
    const distance = start.distanceTo(end) / 3;
    const angleRad = THREE.MathUtils.degToRad(85);

    const p1 = start.clone().add(direction.clone().multiplyScalar(distance));
    const p2 = p1.clone().add(new THREE.Vector3(
        Math.cos(angleRad) * distance,
        Math.sin(angleRad) * distance,
        Math.sin(angleRad) * distance
    ));
    const p3 = start.clone().add(direction.clone().multiplyScalar(2 * distance));
    const p4 = end;

    // Add recursive tasks to the queue
    fractalQueue.push({
        iterations: iterations - 1,
        length: length / 3,
        start: start,
        end: p1,
        color: color,
        directions: directions
    });
    fractalQueue.push({
        iterations: iterations - 1,
        length: length / 3,
        start: p1,
        end: p2,
        color: color,
        directions: directions
    });
    fractalQueue.push({
        iterations: iterations - 1,
        length: length / 3,
        start: p2,
        end: p3,
        color: color,
        directions: directions
    });
    fractalQueue.push({
        iterations: iterations - 1,
        length: length / 3,
        start: p3,
        end: p4,
        color: color,
        directions: directions
    });

    directions.forEach(dir => {
        const offset = new THREE.Vector3(...dir).multiplyScalar(distance);
        const p1_alt = p1.clone().add(offset);
        const p2_alt = p2.clone().add(offset);
        const p3_alt = p3.clone().add(offset);
        const p4_alt = p4.clone().add(offset);

        fractalQueue.push({
            iterations: iterations - 1,
            length: length / 3,
            start: p1,
            end: p1_alt,
            color: color,
            directions: directions
        });
        fractalQueue.push({
            iterations: iterations - 1,
            length: length / 3,
            start: p2,
            end: p2_alt,
            color: color,
            directions: directions
        });
        fractalQueue.push({
            iterations: iterations - 1,
            length: length / 3,
            start: p3,
            end: p3_alt,
            color: color,
            directions: directions
        });
        fractalQueue.push({
            iterations: iterations - 1,
            length: length / 3,
            start: p4,
            end: p4_alt,
            color: color,
            directions: directions
        });
    });
}

export class Koch extends THREE.Object3D {
    constructor(color = null, iterations = 1, directions = null) {
        super();

        this.fractalQueue = [];

        this.color = (!color) ? new THREE.Color("black") : color;
        this.directions = (!directions) ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : directions
        console.log("color", this.color);

        // Add initial fractal task to the queue
        this.fractalQueue.push({
            iterations: iterations,
            length: 10,
            start: new THREE.Vector3(0, 0, 0),
            end: new THREE.Vector3(0, 0, 50),
            color: this.color,
            directions: this.directions,
        });

        this.scale.multiplyScalar(1 / 50)
    }

    processFractalQueue() {
        if (this.fractalQueue.length > 0) {
            const task = this.fractalQueue.shift();
            create3DKochFractal(this, this.fractalQueue, task.iterations, task.length, task.start, task.end, task.color, task.directions);
        }
    }

    update() {
        this.processFractalQueue();
    }
}

export class Koch4D extends THREE.Object3D {
    constructor() {
        super();

        this.koch1 = new Koch(new THREE.Color(0xd79cff), 3, [
            [-3, 0, 0],
            [0, -4, 0],
            [-4, 0, 0]
        ]);

        this.koch2 = new Koch(new THREE.Color(0x6c696e), 3, [
            [Math.round(4), 0, 0],
            [0, 0, Math.round(-3 * Math.random())],
            [0, 0, Math.round(2 * Math.random())]
        ]);

        this.koch3 = new Koch(new THREE.Color(0xdbbc67), 3, [
            [-Math.round(-4 * Math.random()), 0, 0],
            [0, Math.round(4 * Math.random()), 0],
            [0, 0, Math.round(2 * Math.random() + 1)]
        ]);

        this.koch3.scale.multiplyScalar(2)

        // this.koch4 = new Koch(new THREE.Color("pink"), 3, [
        //     [Math.round(2 * Math.random() + 1), 0, 0],
        //     [0, Math.round(2 * Math.random() + 1), 0],
        //     [0, 0, Math.round(-2 * Math.random() + 1)]
        // ])

        this.add(this.koch1, this.koch2, this.koch3);

        this.position.set(0, 2, -2)
        this.endPosition = new THREE.Vector3(0, 6, -6);
        this.startPosition = this.position.clone();
        this.startTime = null;
        this.duration = 2;
    }

    dispose() {

    }

    update(time) {
        if (this.startTime === null) {
            this.startTime = time;
        }

        const elapsedTime = (time - this.startTime) / 20; // Convert to seconds
        const t = Math.min(elapsedTime / this.duration, 1); // Calculate interpolation factor (0 to 1)

        this.position.lerpVectors(this.startPosition, this.endPosition, t);

        console.log(this.position, t, elapsedTime);

        this.koch1.update();
        this.koch2.update();
        this.koch3.update();

        this.koch1.rotation.x = -Math.sin(time / 10)
        this.koch1.rotation.y = -Math.sin(time / 10)
        this.koch2.rotation.z = Math.sin(time / 10)
        this.koch2.rotation.y = Math.tan(time / 10)
        this.koch3.rotation.x = Math.sin(time / 4)

        this.rotation.z += 0.001;

    }
}