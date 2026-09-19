import * as THREE from 'three';

// Shared low-poly material palette for part-based props (buildings, trees, ...).
const MATERIALS = {
  wall: new THREE.MeshStandardMaterial({ color: 0xcccccc }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8a5a44 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x3f7d40 }),
};

function createGeometry(part) {
  switch (part.shape) {
    case 'cone':
      return new THREE.ConeGeometry(part.radius, part.height, part.radialSegments ?? 8);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        part.radiusTop ?? part.radius,
        part.radiusBottom ?? part.radius,
        part.height,
        part.radialSegments ?? 8
      );
    case 'sphere':
      return new THREE.SphereGeometry(part.radius, part.widthSegments ?? 8, part.heightSegments ?? 6);
    default:
      return new THREE.BoxGeometry(part.width, part.height, part.depth);
  }
}

// A sphere's vertical extent is its diameter; every other shape carries its own height.
function partHeight(part) {
  return part.shape === 'sphere' ? part.radius * 2 : part.height;
}

// Builds one part whose local bottom sits at y = part.baseY.
function createPart(part) {
  const mesh = new THREE.Mesh(createGeometry(part), MATERIALS[part.material] ?? MATERIALS.wall);
  mesh.position.set(part.x ?? 0, part.baseY + partHeight(part) / 2, part.z ?? 0);
  if (part.rotationYDeg) mesh.rotation.y = THREE.MathUtils.degToRad(part.rotationYDeg);
  return mesh;
}

// Builds a prop from a list of box/cone/cylinder/sphere parts. The result's
// ground plane is local y=0, so callers can seat it flush against a surface.
export function createFromParts(parts) {
  if (parts.length === 1) return createPart(parts[0]);
  const group = new THREE.Group();
  parts.forEach((part) => group.add(createPart(part)));
  return group;
}
