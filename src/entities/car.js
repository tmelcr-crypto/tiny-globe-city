import * as THREE from 'three';

// Low-poly car: body + cabin + 4 wheels. Data: data/vehicles.json
export function createCar(def) {
  const group = new THREE.Group();
  group.name = `car:${def.id}`;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.6, 1),
    new THREE.MeshStandardMaterial({ color: def.color ?? 0x3366cc, flatShading: true })
  );
  body.position.y = 0.5;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.5, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
  );
  cabin.position.set(-0.1, 1.05, 0);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[0.7, 0.5], [0.7, -0.5], [-0.7, 0.5], [-0.7, -0.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.3, z);
    group.add(wheel);
  }

  // Matches the player's height above the globe surface (see entities/player.js)
  // so proximity checks compare like-for-like points, not the car's root vs.
  // the player's capsule center.
  const entryPoint = new THREE.Object3D();
  entryPoint.position.set(0, 0.8, 0);
  group.add(entryPoint);

  group.userData = { def, occupied: false, entryPoint };
  return group;
}

// Sits the car on the globe surface, oriented upright at that point (see world/globe.js).
export function placeOnGlobe(car, globeRadius, direction) {
  car.position.copy(direction).multiplyScalar(globeRadius);
  car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
}
