import * as THREE from 'three';
import { range } from '../core/rng.js';

const ROCK = new THREE.MeshStandardMaterial({ color: 0x6b6f63, flatShading: true });
const SNOW = new THREE.MeshStandardMaterial({ color: 0xe8eef2, flatShading: true });

// A low-poly peak, 28–52 m tall, sitting on its base like everything else.
export function createMountain(rng = Math.random) {
  const height = range(rng, [28, 52]);
  const radius = height * range(rng, [0.5, 0.7]);

  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6 + Math.floor(rng() * 3)), ROCK);
  rock.position.y = height / 2;
  group.add(rock);

  if (height > 42) {
    const capHeight = height * 0.26;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.27, capHeight, 6), SNOW);
    cap.position.y = height - capHeight / 2;
    group.add(cap);
  }

  group.userData.footprint = radius;
  return group;
}
