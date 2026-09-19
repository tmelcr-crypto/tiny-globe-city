import * as THREE from 'three';
import buildingTypes from '../data/buildings.json';

const MATERIALS = {
  wall: new THREE.MeshStandardMaterial({ color: 0xcccccc }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8a5a44 }),
};

// Builds one part (box or cone) whose local bottom sits at y = part.baseY.
function createPart(part) {
  const geometry =
    part.shape === 'cone'
      ? new THREE.ConeGeometry(part.radius, part.height, part.radialSegments ?? 8)
      : new THREE.BoxGeometry(part.width, part.height, part.depth);
  const mesh = new THREE.Mesh(geometry, MATERIALS[part.material] ?? MATERIALS.wall);
  mesh.position.set(part.x ?? 0, part.baseY + part.height / 2, part.z ?? 0);
  if (part.rotationYDeg) mesh.rotation.y = THREE.MathUtils.degToRad(part.rotationYDeg);
  return mesh;
}

// Builds a building from a data/buildings.json entry. The result's ground
// plane is local y=0, so world/globe.js can seat it flush against the sphere.
export function createBuilding(def) {
  if (def.parts.length === 1) return createPart(def.parts[0]);
  const group = new THREE.Group();
  def.parts.forEach((part) => group.add(createPart(part)));
  return group;
}

export function createRandomBuilding() {
  const def = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
  return createBuilding(def);
}
