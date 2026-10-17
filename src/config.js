// Cube Breakers: shared constants and tuning.

export const N = 24;
export const HALF = N / 2;
export const SIZE = N * N * N;
export const DOME_R = 100;
export const PLAY_R = DOME_R - 1.5;
export const BALL_CAP = 80;
export const SIM_HZ = 120;
export const PHYS_HZ = 60;
export const BASE_SPEED = 15;
export const GRAVITY = 22;

export const KIND = { EMPTY: 0, NORMAL: 1, TNT: 2, GOLD: 3, CRATE: 4 };

export const PATTERN = { PLAIN: 0, STRIPES: 2, FACE: 3, ARMOR: 4, CORE: 5, TNT: 6, GOLD: 7, CRATE: 8 };

export const LAYERS = [
  { hp: 10, value: 1, pattern: PATTERN.PLAIN, colors: ['#3aa9f5', '#2e95ec', '#46bdf8', '#3aa0f2'] },
  { hp: 30, value: 2, pattern: PATTERN.PLAIN, colors: ['#3fcf4e', '#a6e81f', '#f7c51c', '#f39a1f', '#35c9e8', '#2fb35a'] },
  { hp: 90, value: 5, pattern: PATTERN.STRIPES, colors: ['#2fbf8f', '#2fa3d8', '#c4e021', '#f2b51c', '#34c45a', '#ef8f2a'] },
  { hp: 300, value: 12, pattern: PATTERN.FACE, colors: ['#2b63d8', '#2f80e8', '#1f9fc4', '#3a52c9'] },
  { hp: 900, value: 30, pattern: PATTERN.FACE, colors: ['#2348b8', '#2a3fa8', '#1d6fae', '#3b3fb8'] },
  { hp: 2500, value: 70, pattern: PATTERN.ARMOR, colors: ['#3a3f8f', '#2d3b7a', '#46408f'] },
  { hp: 6000, value: 160, pattern: PATTERN.ARMOR, colors: ['#272c5e', '#2f2a66', '#22305a'] },
  { hp: 15000, value: 400, pattern: PATTERN.CORE, colors: ['#b04df0', '#9a3fe8'] },
];

export const SPECIAL = {
  [KIND.TNT]: { color: '#ff8a1a', hpMul: 0.5, pattern: PATTERN.TNT, value: 3 },
  [KIND.GOLD]: { color: '#ffc531', hpMul: 2.5, pattern: PATTERN.GOLD, value: 8 },
  [KIND.CRATE]: { color: '#cdeeff', hpMul: 1, pattern: PATTERN.CRATE, value: 2 },
};

export const TNT_BLAST = { radius: 2.4, hpMul: 3, min: 150 };

export const BALL_TYPES = [
  { id: 'aero', name: 'AeroBall', desc: 'Bounces forever.', color: '#2f9bff', radius: 0.22, speed: 1, damage: 10 },
  { id: 'multi', name: 'MultiBall', desc: 'Bursts into multiple balls on impact.', color: '#8fe032', radius: 0.24, speed: 1, damage: 10, split: 5 },
  { id: 'boom', name: 'BoomBall', desc: 'Makes boom and damages a lot of blocks at once.', color: '#ff9a1f', radius: 0.26, speed: 1, damage: 0, boom: { radius: 2.4, damage: 200 } },
  { id: 'pierce', name: 'PierceBall', desc: 'Drills through 4 blocks before bouncing.', color: '#b08cff', radius: 0.2, speed: 1.15, damage: 9, pierce: 4 },
  { id: 'homing', name: 'HomingBall', desc: 'Steers toward the nearest block.', color: '#ff6fcf', radius: 0.22, speed: 0.95, damage: 9, homing: 2.8 },
  { id: 'mega', name: 'MegaBall', desc: 'Huge and heavy. Smashes everything it touches.', color: '#5a45e0', radius: 0.62, speed: 0.72, damage: 40, mega: true },
  { id: 'ice', name: 'IceBall', desc: 'Frozen blocks take double damage for 8 s.', color: '#bdf2ff', radius: 0.22, speed: 1, damage: 6, freeze: 8 },
  { id: 'gold', name: 'GoldBall', desc: 'Blocks it breaks drop double loot.', color: '#ffc531', radius: 0.22, speed: 1, damage: 8, gold: true },
];

export const MINI = { id: 'mini', name: 'MiniBall', color: '#e3f53a', radius: 0.16, speed: 1.05, damage: 6 };
