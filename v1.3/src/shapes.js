// Cube Breakers: level shapes inside the block grid and per-shape colour accents.

import { N } from './config.js';

const C = (N - 1) / 2;

export const SHAPES = [
  {
    id: 'cube',
    name: 'The Cube',
    shell: ['#3aa9f5', '#2e95ec', '#46bdf8', '#3aa0f2'],
    solid: (x, y, z) => x >= 4 && x < 20 && z >= 4 && z < 20 && y < 16,
  },
  {
    id: 'pyramid',
    name: 'The Pyramid',
    shell: ['#f7c51c', '#f2b51c', '#ffd34a', '#efa81a'],
    solid: (x, y, z) => {
      const h = 10.5 - y;
      return h >= 0 && Math.abs(x - C) <= h && Math.abs(z - C) <= h;
    },
  },
  {
    id: 'sphere',
    name: 'The Sphere',
    shell: ['#ff7ad0', '#f45cc0', '#ff94dc', '#ea6ad2'],
    solid: (x, y, z) => (x - C) ** 2 + (y - 9.6) ** 2 + (z - C) ** 2 <= 9.7 ** 2,
  },
  {
    id: 'tower',
    name: 'The Tower',
    shell: ['#e9f1f8', '#d7e4ef', '#f4f8fb', '#cddbe8'],
    solid: (x, y, z) => {
      const inX = x >= 7 && x < 17, inZ = z >= 7 && z < 17;
      if (!inX || !inZ) return false;
      if (y < 21) {
        const wall = x === 7 || x === 16 || z === 7 || z === 16;
        if (wall && y % 5 === 3 && ((x + z) % 4 === 1)) return false;
        return true;
      }
      if (y < 23) {
        const edge = x === 7 || x === 16 || z === 7 || z === 16;
        return edge && ((x + z) % 2 === 0 || y === 21);
      }
      return false;
    },
  },
  {
    id: 'rocket',
    name: 'The GSP Rocket',
    shell: ['#f4f8fb', '#e6eef6', '#ffffff', '#dbe7f2'],
    accent: (x, y, z) => {
      const r = Math.hypot(x - C, z - C);
      if (y >= 18) return '#2f6fe0';
      if (y >= 9 && y <= 10 && r > 3.2) return '#2f6fe0';
      if (r > 4.6) return '#2f6fe0';
      if (y < 3) return '#9aa6b8';
      return null;
    },
    solid: (x, y, z) => {
      const dx = x - C, dz = z - C;
      const r = Math.hypot(dx, dz);
      if (y < 3) {
        if (r <= 2.4 + y * 0.35) return true;
      } else if (y < 18) {
        if (r <= 4.3) return true;
      } else if (y < 24) {
        if (r <= 4.3 * (1 - (y - 17.5) / 6.6)) return true;
      }
      if (y < 9) {
        const reach = 8.6 - y * 0.45;
        const finA = Math.abs(dx) < 0.6 && Math.abs(dz) <= reach;
        const finB = Math.abs(dz) < 0.6 && Math.abs(dx) <= reach;
        if ((finA || finB) && r > 3.5) return true;
      }
      return false;
    },
  },
  {
    id: 'donut',
    name: 'The Donut',
    shell: ['#ff8fc8', '#ff7ab8', '#ffa6d4', '#f58ac4'],
    accent: (x, y, z, rnd) => (y >= 5 && rnd() < 0.18 ? ['#ffffff', '#ffd34a', '#46bdf8', '#8fe032', '#b08cff'][Math.floor(rnd() * 5)] : null),
    solid: (x, y, z) => {
      const R = Math.hypot(x - C, z - C);
      return (R - 7.3) ** 2 + (y - 3.9) ** 2 <= 4.1 ** 2;
    },
  },
];

export function shapeFor(level) {
  return SHAPES[(level - 1) % SHAPES.length];
}

export function levelHpMul(level) {
  return Math.pow(1.8, level - 1);
}

export function levelValueMul(level) {
  return Math.pow(1.55, level - 1);
}
