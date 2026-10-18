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
  { id: 'aero', name: 'AeroBall', desc: 'Bounces forever.', color: '#2f9bff', radius: 0.22, speed: 1, damage: 10, price: 0.25, crate: 20 },
  { id: 'multi', name: 'MultiBall', desc: 'Bursts into multiple balls on impact.', color: '#8fe032', radius: 0.24, speed: 1, damage: 10, split: 5, price: 15, crate: 5 },
  { id: 'boom', name: 'BoomBall', desc: 'Makes boom and damages a lot of blocks at once.', color: '#ff9a1f', radius: 0.26, speed: 1, damage: 0, boom: { radius: 2.4, damage: 200 }, price: 80, crate: 3 },
  { id: 'pierce', name: 'PierceBall', desc: 'Drills through 4 blocks before bouncing.', color: '#b08cff', radius: 0.2, speed: 1.15, damage: 9, pierce: 4, price: 25, crate: 5 },
  { id: 'homing', name: 'HomingBall', desc: 'Steers toward the nearest block.', color: '#ff6fcf', radius: 0.22, speed: 0.95, damage: 9, homing: 2.8, price: 30, crate: 5 },
  { id: 'mega', name: 'MegaBall', desc: 'Huge and heavy. Smashes everything it touches.', color: '#5a45e0', radius: 0.62, speed: 0.72, damage: 40, mega: true, price: 150, crate: 2 },
  { id: 'ice', name: 'IceBall', desc: 'Frozen blocks take double damage for 8 s.', color: '#bdf2ff', radius: 0.22, speed: 1, damage: 6, freeze: 8, price: 35, crate: 5 },
  { id: 'gold', name: 'GoldBall', desc: 'Blocks it breaks drop double loot.', color: '#ffc531', radius: 0.22, speed: 1, damage: 8, gold: true, price: 50, crate: 5 },
  { id: 'toxic', name: 'ToxicBall', desc: 'Poisons every block it touches. The poison eats the block and spreads to its neighbours.', color: '#43ff7a', radius: 0.23, speed: 0.95, damage: 6, toxic: { dps: 24, time: 6, spread: 0.3, gen: 3 }, price: 45, crate: 4 },
  { id: 'hole', name: 'Black Hole', desc: 'Collapses into a black hole on impact and crushes everything around it for 4 s.', color: '#3a1670', radius: 0.26, speed: 0.9, damage: 0, hole: { radius: 2.7, time: 4, dps: 240 }, price: 350, crate: 1 },
  { id: 'ghost', name: 'GhostBall', desc: 'Floats through the soft outer blocks and explodes deep inside at the hard ones.', color: '#e9f6ff', radius: 0.22, speed: 0.9, damage: 0, ghost: { layer: 3, radius: 2.3, damage: 650 }, price: 110, crate: 3 },
  { id: 'firework', name: 'Firework', desc: 'After 3 bounces it bursts into a shower of sparks.', color: '#ff4fd8', radius: 0.23, speed: 1.05, damage: 10, firework: { bounces: 3, sparks: 9 }, price: 70, crate: 4 },
  { id: 'sniper', name: 'Sniper', desc: 'Four times faster than anything else. One massive hit, then it is gone.', color: '#20d8c8', radius: 0.16, speed: 4, damage: 900, sniper: true, price: 160, crate: 2 },
];

export const BALL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
export const BALL_KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export const MINI = { id: 'mini', name: 'MiniBall', color: '#e3f53a', radius: 0.16, speed: 1.05, damage: 6 };
export const SPARK = { id: 'spark', name: 'Spark', color: '#ffffff', radius: 0.14, speed: 1.35, damage: 16, life: 4.5 };
export const ACID = { ...BALL_TYPES[8], id: 'acid', radius: 0.2, speed: 1.1, life: 7 };
export const METEOR = { id: 'meteor', name: 'Meteor', color: '#ff8a1a', radius: 0.58, speed: 1.7, damage: 0, boom: { radius: 3.2, damage: 520 }, life: 9, meteor: true };

export const POWERUPS = [
  { id: 'orbital', name: 'Orbital Strike', short: 'Orbital', desc: 'A laser from space wipes out the whole 1×1 column you aim at.', color: '#46d7ff', price: 1500, aim: true },
  { id: 'goldrush', name: 'Gold Rush', short: 'Gold Rush', desc: 'Every block turns to gold for 60 s. All loot is worth 5×.', color: '#ffc531', price: 2500, dur: 60 },
  { id: 'infinite', name: 'Infinite Balls', short: 'Infinite', desc: 'For 20 s nobody on the team uses up any balls they own.', color: '#2f9bff', price: 2400, dur: 20 },
  { id: 'toxicrain', name: 'Toxic Rain', short: 'Toxic Rain', desc: 'Hundreds of toxic balls pour from the sky for 12 s.', color: '#43ff7a', price: 1800, dur: 12, sky: true },
  { id: 'meteor', name: 'Meteor Shower', short: 'Meteors', desc: 'Exploding meteors pound the shape for 15 s.', color: '#ff9a1f', price: 2200, dur: 15, sky: true },
  { id: 'triple', name: 'Triple Shot', short: 'Triple', desc: 'Every launcher fires 3 balls per shot for 30 s.', color: '#b08cff', price: 1000, dur: 30 },
  { id: 'freeze', name: 'Freeze Wave', short: 'Freeze', desc: 'Freezes the whole shape for 15 s. Frozen blocks take double damage.', color: '#bdf2ff', price: 900, dur: 15 },
  { id: 'magnet', name: 'Super Magnet', short: 'Magnet', desc: 'For 20 s all loot on the map flies to the nearest player.', color: '#ff6fcf', price: 600, dur: 20 },
];

export const DRILL = { price: 20000, speed: 7.5, climb: 4.5, dps: 420, tip: 1.15, body: 0.5 };
export const TURRET = { price: 5000, max: 3, load: 50, rate: 14, cap: 40 };
export const VEND_PRICE = 1000;
