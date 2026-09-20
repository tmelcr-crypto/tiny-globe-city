import * as THREE from 'three';

// Converts lat/lon (degrees) to a unit direction vector from the globe's center.
export function latLonToDirection(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}
