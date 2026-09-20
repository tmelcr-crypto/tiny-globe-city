import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createProp } from '../src/entities/prop.js';

const sizeOf = (object) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

describe('props from data', () => {
  it('keeps a two-number cylinder straight', () => {
    // [radius, height] only: the third number is the bottom radius, and leaving
    // it out used to widen the base to a metre — every post became a cone.
    const post = createProp({ id: 'post', parts: [{ shape: 'cylinder', size: [0.08, 3], at: [0, 1.5, 0] }] });
    const size = sizeOf(post);
    expect(size.x).toBeLessThan(0.2);
    expect(size.z).toBeLessThan(0.2);
    expect(size.y).toBeCloseTo(3, 1);
  });

  it('tapers when a bottom radius is given', () => {
    const taper = createProp({ id: 'taper', parts: [{ shape: 'cylinder', size: [0.1, 2, 0.6], at: [0, 1, 0] }] });
    // A ten-sided cylinder measures its apothem across the flats, not 2r.
    const width = sizeOf(taper).x;
    expect(width).toBeGreaterThan(1.1);
    expect(width).toBeLessThan(1.2);
  });

  it('stands on the ground', () => {
    const prop = createProp({ id: 'block', parts: [{ shape: 'box', size: [1, 2, 1], at: [0, 1, 0] }] });
    expect(new THREE.Box3().setFromObject(prop).min.y).toBeCloseTo(0, 5);
  });

  it('merges parts into one mesh per colour', () => {
    const prop = createProp({
      id: 'two-tone',
      parts: [
        { shape: 'box', size: [1, 1, 1], at: [0, 0.5, 0], color: '#ff0000' },
        { shape: 'box', size: [1, 1, 1], at: [2, 0.5, 0], color: '#ff0000' },
        { shape: 'sphere', size: [0.5], at: [0, 1.5, 0], color: '#0000ff' },
      ],
    });
    expect(prop.children).toHaveLength(2);
  });

  it('carries its kind and footprint', () => {
    const prop = createProp({ id: 'bench', footprint: 1.1, parts: [{ shape: 'box', size: [1, 1, 1], at: [0, 0.5, 0] }] });
    expect(prop.userData).toMatchObject({ kind: 'bench', footprint: 1.1 });
  });
});
