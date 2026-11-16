// VOIDLIGHT — every tuning number and colour in one place.
// The playfield is a fixed 1280x800 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Hull hearts; reaching wave 10 and clearing it wins the game. */
export const HULL = 3;
export const WIN_WAVE = 10;

export const SHIP = {
  radius: 14,
  accel: 2400,
  maxSpeed: 420,
  drag: 0.86,
  fireInterval: 0.14,
  bulletSpeed: 920,
  bulletDamage: 1,
  invulnerable: 1.6,
  /** Nova charge gained per light shard, and the charge a full Nova needs. */
  shardCharge: 9,
  novaMax: 100,
  novaRadius: 420,
  novaDamage: 6,
};

export const BULLET = { radius: 4, life: 0.9 };

export const ENEMY = {
  drifter: { hp: 2, speed: 95, radius: 18, score: 50, shards: 2, color: '#ff4d6d' },
  darter: { hp: 1, speed: 230, radius: 11, score: 40, shards: 1, color: '#ffb020' },
  spitter: { hp: 3, speed: 70, radius: 20, score: 90, shards: 2, color: '#c86bff' },
  splitter: { hp: 5, speed: 55, radius: 28, score: 120, shards: 3, color: '#ff5c39' },
  dreadnought: { hp: 42, speed: 42, radius: 52, score: 800, shards: 10, color: '#ff2e63' },
};

/** Enemy bullets. */
export const ORB = { radius: 6, speed: 210, life: 6 };

/** Light shards: what enemies drop, what the ship collects. */
export const SHARD = { radius: 5, score: 5, magnet: 150, pull: 900, life: 9 };

/** Pickups that drift across the field. */
export const PICKUP = {
  interval: 22,
  aegis: { radius: 14, life: 12 },
  overdrive: { radius: 14, life: 12, seconds: 8 },
};

export const COMBO = { window: 2.5, perKill: 1, step: 4, maxMult: 5 };

/** A wave's spawn budget: how many of each enemy, and how fast they arrive. */
export function wavePlan(wave) {
  const drifters = 5 + wave * 2;
  const darters = wave >= 2 ? 2 + wave : 0;
  const spitters = wave >= 3 ? 1 + Math.floor(wave / 2) : 0;
  const splitters = wave >= 4 ? Math.floor(wave / 3) : 0;
  const dreadnoughts = wave === 5 || wave === 10 ? 1 : 0;
  return {
    drifters,
    darters,
    spitters,
    splitters,
    dreadnoughts,
    interval: Math.max(0.3, 0.85 - wave * 0.06),
    hpBonus: Math.floor((wave - 1) / 3),
  };
}

/** Wave-clear bonus. */
export function waveBonus(wave) {
  return 100 + wave * 50;
}

export const PALETTE = {
  backdrop: '#05070f',
  nebulaA: 'rgba(64, 48, 140, 0.55)',
  nebulaB: 'rgba(16, 90, 110, 0.45)',
  nebulaC: 'rgba(120, 30, 80, 0.35)',
  ship: '#7df9ff',
  shipCore: '#eafcff',
  bullet: '#aefcff',
  shard: '#ffd94d',
  text: '#eef4ff',
  muted: '#9aa7c7',
  dim: '#5c6b8c',
  danger: '#ff4d6d',
  panel: 'rgba(10, 16, 34, 0.92)',
  panelEdge: 'rgba(125, 249, 255, 0.35)',
  barBack: 'rgba(255, 255, 255, 0.12)',
  nova: '#8ef7ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidlight.best';
