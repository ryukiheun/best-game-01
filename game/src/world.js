// VOIDLIGHT's rules and state, with no drawing and no browser in it: the ship,
// bullets, enemies, shards, pickups, particles and waves. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react
// (sound, shake, announcements) without the world knowing about screens.

import {
  FIELD, STEP, HULL, WIN_WAVE, SHIP, BULLET, ENEMY, ORB, SHARD, PICKUP, COMBO,
  wavePlan, waveBonus,
} from './config.js';
import { range } from './random.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_SHARD = 8;
export const EVENT_NOVA = 16;
export const EVENT_WAVE = 32;
export const EVENT_OVER = 64;
export const EVENT_WIN = 128;
export const EVENT_PICKUP = 256;

export const KIND_DRIFTER = 'drifter';
export const KIND_DARTER = 'darter';
export const KIND_SPITTER = 'spitter';
export const KIND_SPLITTER = 'splitter';
export const KIND_DREADNOUGHT = 'dreadnought';

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const ship = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    radius: SHIP.radius,
    hull: HULL, invulnerable: 0, fireTimer: 0, nova: 0, overdrive: 0, aegis: false,
    trailTimer: 0,
  };
  const state = {
    ship,
    bullets: [], enemies: [], orbs: [], shards: [], pickups: [], particles: [], texts: [],
    score: 0, best: 0, combo: 0, comboTimer: 0, mult: 1, wave: 1,
    waveState: 'intro', waveTimer: 2, spawnQueue: [], spawnTimer: 0,
    pickupTimer: PICKUP.interval, elapsed: 0, kills: 0, shake: 0, flash: 0, over: false, won: false,
  };

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life: life * (0.5 + random() * 0.5), maxLife: life, size: size * (0.6 + random() * 0.8), color,
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addText(x, y, text, color) {
    state.texts.push({ x, y, text, color, life: 1 });
    if (state.texts.length > 24) state.texts.shift();
  }

  function addScore(points, x, y) {
    const gained = points * state.mult;
    state.score += gained;
    if (x !== undefined) addText(x, y, `+${gained}`, '#ffd94d');
  }

  function startWave(wave) {
    const plan = wavePlan(wave);
    const queue = [];
    for (let i = 0; i < plan.drifters; i += 1) queue.push(KIND_DRIFTER);
    for (let i = 0; i < plan.darters; i += 1) queue.push(KIND_DARTER);
    for (let i = 0; i < plan.spitters; i += 1) queue.push(KIND_SPITTER);
    for (let i = 0; i < plan.splitters; i += 1) queue.push(KIND_SPLITTER);
    for (let i = 0; i < plan.dreadnoughts; i += 1) queue.push(KIND_DREADNOUGHT);
    // Shuffle the queue so the wave arrives mixed.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.5;
    state.waveState = 'intro';
    state.waveTimer = 2;
    state.wave = wave;
  }

  function spawnEnemy(kind) {
    const def = ENEMY[kind];
    const plan = wavePlan(state.wave);
    // Enter at an edge, away from the ship.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = random() * FIELD.width; y = -40; }
      else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + 40; }
      else if (edge === 2) { x = -40; y = random() * FIELD.height; }
      else { x = FIELD.width + 40; y = random() * FIELD.height; }
      if (dist2(x, y, ship.x, ship.y) > 260 * 260) break;
    }
    state.enemies.push({
      kind, x, y, vx: 0, vy: 0, angle: random() * TAU,
      hp: def.hp + plan.hpBonus, maxHp: def.hp + plan.hpBonus,
      radius: def.radius, speed: def.speed * (0.9 + random() * 0.2),
      fireTimer: range(random, 1.5, 2.5), wobble: random() * TAU,
    });
  }

  function spawnPickup() {
    const kind = random() < 0.5 ? 'aegis' : 'overdrive';
    const edge = Math.floor(random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) { x = random() * FIELD.width; y = -30; }
    else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + 30; }
    else if (edge === 2) { x = -30; y = random() * FIELD.height; }
    else { x = FIELD.width + 30; y = random() * FIELD.height; }
    state.pickups.push({
      kind, x, y, vx: (FIELD.width / 2 - x) * 0.02, vy: (FIELD.height / 2 - y) * 0.02,
      radius: PICKUP.aegis.radius, life: PICKUP.aegis.life, pulse: random() * TAU,
    });
  }

  function dropShards(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      state.shards.push({
        x, y,
        vx: Math.cos(angle) * range(random, 40, 140),
        vy: Math.sin(angle) * range(random, 40, 140),
        radius: SHARD.radius, life: SHARD.life,
      });
    }
  }

  function killEnemy(index, award) {
    const enemy = state.enemies[index];
    const def = ENEMY[enemy.kind];
    burst(enemy.x, enemy.y, def.color, enemy.kind === KIND_DREADNOUGHT ? 60 : 18, 260, 0.7, 3);
    burst(enemy.x, enemy.y, '#ffffff', 6, 180, 0.3, 2);
    dropShards(enemy.x, enemy.y, def.shards);
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.mult = Math.min(COMBO.maxMult, 1 + Math.floor(state.combo / COMBO.step));
    if (award) addScore(def.score, enemy.x, enemy.y);
    state.shake = Math.max(state.shake, enemy.kind === KIND_DREADNOUGHT ? 14 : 5);
    // A splitter breaks into two darters.
    if (enemy.kind === KIND_SPLITTER) {
      for (let i = 0; i < 2; i += 1) {
        state.enemies.push({
          kind: KIND_DARTER, x: enemy.x + (i === 0 ? -14 : 14), y: enemy.y,
          vx: 0, vy: 0, angle: random() * TAU,
          hp: ENEMY.darter.hp, maxHp: ENEMY.darter.hp, radius: ENEMY.darter.radius,
          speed: ENEMY.darter.speed, fireTimer: 0, wobble: random() * TAU,
        });
      }
    }
    state.enemies.splice(index, 1);
    return EVENT_KILL;
  }

  function damageShip() {
    if (ship.invulnerable > 0 || state.over) return 0;
    if (ship.aegis) {
      ship.aegis = false;
      ship.invulnerable = 1;
      burst(ship.x, ship.y, '#8ef7ff', 24, 300, 0.5, 3);
      state.shake = Math.max(state.shake, 8);
      return EVENT_HIT;
    }
    ship.hull -= 1;
    ship.invulnerable = SHIP.invulnerable;
    state.combo = 0;
    state.mult = 1;
    state.comboTimer = 0;
    state.flash = 0.5;
    state.shake = Math.max(state.shake, 12);
    burst(ship.x, ship.y, '#ff4d6d', 30, 320, 0.8, 3);
    if (ship.hull <= 0) {
      state.over = true;
      burst(ship.x, ship.y, '#7df9ff', 80, 420, 1.2, 4);
      burst(ship.x, ship.y, '#ffffff', 30, 300, 0.8, 3);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireNova() {
    ship.nova = 0;
    state.flash = 0.7;
    state.shake = Math.max(state.shake, 16);
    burst(ship.x, ship.y, '#8ef7ff', 50, 600, 0.9, 4);
    let events = EVENT_NOVA;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= SHIP.novaRadius * SHIP.novaRadius) {
        enemy.hp -= SHIP.novaDamage;
        if (enemy.hp <= 0) events |= killEnemy(i, true);
      }
    }
    state.orbs.length = 0;
    return events;
  }

  function reset() {
    ship.x = FIELD.width / 2;
    ship.y = FIELD.height / 2;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.hull = HULL;
    ship.invulnerable = 0;
    ship.fireTimer = 0;
    ship.nova = 0;
    ship.overdrive = 0;
    ship.aegis = false;
    state.bullets.length = 0;
    state.enemies.length = 0;
    state.orbs.length = 0;
    state.shards.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.texts.length = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.mult = 1;
    state.wave = 1;
    state.pickupTimer = PICKUP.interval;
    state.elapsed = 0;
    state.kills = 0;
    state.shake = 0;
    state.flash = 0;
    state.over = false;
    state.won = false;
    startWave(1);
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, fire, nova}: the move axes,
   * the aim point in field coordinates (or null), and the fire/nova buttons.
   * With `harmless` set (the title screen's backdrop) things drift but nothing
   * fights, scores or dies.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);

    // The ship steers with acceleration and drag, and stays in the field.
    const mx = input ? input.mx : 0;
    const my = input ? input.my : 0;
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      ship.vx += (mx / Math.max(1, len)) * SHIP.accel * dt;
      ship.vy += (my / Math.max(1, len)) * SHIP.accel * dt;
    }
    ship.vx *= Math.pow(SHIP.drag, dt * 60);
    ship.vy *= Math.pow(SHIP.drag, dt * 60);
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > SHIP.maxSpeed) {
      ship.vx = (ship.vx / speed) * SHIP.maxSpeed;
      ship.vy = (ship.vy / speed) * SHIP.maxSpeed;
    }
    ship.x = Math.min(FIELD.width - ship.radius, Math.max(ship.radius, ship.x + ship.vx * dt));
    ship.y = Math.min(FIELD.height - ship.radius, Math.max(ship.radius, ship.y + ship.vy * dt));
    if (input && input.aimX !== null && input.aimX !== undefined) {
      ship.angle = Math.atan2(input.aimY - ship.y, input.aimX - ship.x);
    } else if (len > 0.01) {
      ship.angle = Math.atan2(ship.vy, ship.vx);
    }
    if (ship.invulnerable > 0) ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    if (ship.overdrive > 0) ship.overdrive = Math.max(0, ship.overdrive - dt);

    // Engine trail.
    ship.trailTimer -= dt;
    if (ship.trailTimer <= 0 && speed > 60) {
      ship.trailTimer = 0.03;
      const back = ship.angle + Math.PI;
      state.particles.push({
        x: ship.x + Math.cos(back) * 16, y: ship.y + Math.sin(back) * 16,
        vx: Math.cos(back) * 120 + (random() - 0.5) * 40,
        vy: Math.sin(back) * 120 + (random() - 0.5) * 40,
        life: 0.35, maxLife: 0.35, size: 2.5, color: '#35c8e8',
      });
    }

    if (harmless) {
      // Title backdrop: a few drifters wander, nothing fights.
      if (state.enemies.length < 6 && random() < dt * 0.5) spawnEnemy(random() < 0.7 ? KIND_DRIFTER : KIND_DARTER);
      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = state.enemies[i];
        enemy.x += Math.cos(enemy.angle) * enemy.speed * 0.4 * dt;
        enemy.y += Math.sin(enemy.angle) * enemy.speed * 0.4 * dt;
        enemy.angle += (random() - 0.5) * dt * 2;
        if (enemy.x < -60 || enemy.x > FIELD.width + 60 || enemy.y < -60 || enemy.y > FIELD.height + 60) {
          state.enemies.splice(i, 1);
        }
      }
      updateParticles(dt);
      updateTexts(dt);
      return 0;
    }

    // Combo clock.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.mult = 1;
      }
    }

    // Nova.
    if (input && input.nova && ship.nova >= SHIP.novaMax) events |= fireNova();

    // Firing.
    ship.fireTimer -= dt;
    if (input && input.fire && ship.fireTimer <= 0 && !state.over) {
      const interval = ship.overdrive > 0 ? SHIP.fireInterval / 2 : SHIP.fireInterval;
      ship.fireTimer = interval;
      const shots = ship.overdrive > 0 ? [-0.09, 0.09] : [0];
      for (const offset of shots) {
        const angle = ship.angle + offset;
        state.bullets.push({
          x: ship.x + Math.cos(ship.angle) * 20,
          y: ship.y + Math.sin(ship.angle) * 20,
          vx: Math.cos(angle) * SHIP.bulletSpeed,
          vy: Math.sin(angle) * SHIP.bulletSpeed,
          radius: BULLET.radius, life: BULLET.life, damage: SHIP.bulletDamage,
        });
      }
      events |= EVENT_SHOOT;
    }

    // Waves: intro banner, then spawn the queue, then wait for the field to clear.
    if (state.waveState === 'intro') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) state.waveState = 'fighting';
    } else if (state.waveState === 'fighting') {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer = wavePlan(state.wave).interval;
        }
      } else if (state.enemies.length === 0) {
        const bonus = waveBonus(state.wave);
        addScore(bonus, FIELD.width / 2, FIELD.height / 2 - 40);
        events |= EVENT_WAVE;
        if (state.wave >= WIN_WAVE) {
          state.won = true;
          state.over = true;
          return events | EVENT_WIN;
        }
        state.waveState = 'clear';
        state.waveTimer = 2.2;
      }
    } else if (state.waveState === 'clear') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) startWave(state.wave + 1);
    }

    // Pickups drift in on a timer.
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = PICKUP.interval;
    }

    // Enemies steer and (for spitters and dreadnoughts) shoot.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      const dx = ship.x - enemy.x;
      const dy = ship.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      enemy.wobble += dt * 3;
      if (enemy.kind === KIND_DRIFTER || enemy.kind === KIND_SPLITTER) {
        enemy.vx += (dx / d) * enemy.speed * dt * 3;
        enemy.vy += (dy / d) * enemy.speed * dt * 3;
      } else if (enemy.kind === KIND_DARTER) {
        const wob = Math.sin(enemy.wobble) * 0.8;
        const px = -dy / d;
        const py = dx / d;
        enemy.vx += ((dx / d) + px * wob) * enemy.speed * dt * 4;
        enemy.vy += ((dy / d) + py * wob) * enemy.speed * dt * 4;
      } else if (enemy.kind === KIND_SPITTER) {
        const want = 320;
        const dir = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
        enemy.vx += (dx / d) * dir * enemy.speed * dt * 3;
        enemy.vy += (dy / d) * dir * enemy.speed * dt * 3;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && d < 560) {
          enemy.fireTimer = range(random, 2.2, 3);
          state.orbs.push({
            x: enemy.x, y: enemy.y,
            vx: (dx / d) * ORB.speed, vy: (dy / d) * ORB.speed,
            radius: ORB.radius, life: ORB.life,
          });
        }
      } else if (enemy.kind === KIND_DREADNOUGHT) {
        enemy.vx += (dx / d) * enemy.speed * dt * 2;
        enemy.vy += (dy / d) * enemy.speed * dt * 2;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
          enemy.fireTimer = 3.4;
          for (let k = 0; k < 10; k += 1) {
            const a = (k / 10) * TAU + enemy.wobble;
            state.orbs.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(a) * ORB.speed * 0.8, vy: Math.sin(a) * ORB.speed * 0.8,
              radius: ORB.radius, life: ORB.life,
            });
          }
        }
      }
      const espeed = Math.hypot(enemy.vx, enemy.vy);
      const cap = enemy.speed * 1.6;
      if (espeed > cap) {
        enemy.vx = (enemy.vx / espeed) * cap;
        enemy.vy = (enemy.vy / espeed) * cap;
      }
      enemy.vx *= Math.pow(0.92, dt * 60);
      enemy.vy *= Math.pow(0.92, dt * 60);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.min(FIELD.width + 60, Math.max(-60, enemy.x));
      enemy.y = Math.min(FIELD.height + 60, Math.max(-60, enemy.y));
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    }

    // Bullets fly and hit enemies.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      let dead = bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = state.enemies[j];
          const rr = enemy.radius + bullet.radius;
          if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) <= rr * rr) {
            enemy.hp -= bullet.damage;
            burst(bullet.x, bullet.y, '#aefcff', 3, 120, 0.25, 2);
            dead = true;
            if (enemy.hp <= 0) events |= killEnemy(j, true);
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }

    // Enemy orbs fly and hit the ship.
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      let dead = orb.life <= 0 || orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20;
      if (!dead) {
        const rr = orb.radius + ship.radius;
        if (dist2(orb.x, orb.y, ship.x, ship.y) <= rr * rr) {
          dead = true;
          events |= damageShip();
          if (state.over) return events;
        }
      }
      if (dead) state.orbs.splice(i, 1);
    }

    // Enemies touching the ship hurt it and are destroyed.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      const rr = enemy.radius + ship.radius - 4;
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= rr * rr) {
        burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, 14, 240, 0.5, 3);
        state.enemies.splice(i, 1);
        events |= damageShip();
        if (state.over) return events;
      }
    }

    // Shards drift, magnetise toward the ship, and are collected.
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const shard = state.shards[i];
      shard.life -= dt;
      const d2 = dist2(shard.x, shard.y, ship.x, ship.y);
      if (d2 < SHARD.magnet * SHARD.magnet) {
        const d = Math.sqrt(d2) || 1;
        shard.vx += ((ship.x - shard.x) / d) * SHARD.pull * dt;
        shard.vy += ((ship.y - shard.y) / d) * SHARD.pull * dt;
      } else {
        shard.vx *= Math.pow(0.94, dt * 60);
        shard.vy *= Math.pow(0.94, dt * 60);
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      let dead = shard.life <= 0;
      if (!dead && d2 < (ship.radius + shard.radius + 6) * (ship.radius + shard.radius + 6)) {
        dead = true;
        state.score += SHARD.score;
        ship.nova = Math.min(SHIP.novaMax, ship.nova + SHIP.shardCharge);
        burst(shard.x, shard.y, '#ffd94d', 4, 100, 0.3, 2);
        events |= EVENT_SHARD;
      }
      if (dead) state.shards.splice(i, 1);
    }

    // Pickups drift and are collected.
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.life -= dt;
      pickup.pulse += dt * 4;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      let dead = pickup.life <= 0;
      if (!dead) {
        const rr = pickup.radius + ship.radius + 6;
        if (dist2(pickup.x, pickup.y, ship.x, ship.y) <= rr * rr) {
          dead = true;
          if (pickup.kind === 'aegis') {
            ship.aegis = true;
            addText(ship.x, ship.y - 30, 'AEGIS SHIELD', '#8ef7ff');
          } else {
            ship.overdrive = PICKUP.overdrive.seconds;
            addText(ship.x, ship.y - 30, 'OVERDRIVE', '#ffb020');
          }
          burst(pickup.x, pickup.y, '#8ef7ff', 16, 200, 0.5, 3);
          events |= EVENT_PICKUP;
        }
      }
      if (dead) state.pickups.splice(i, 1);
    }

    updateParticles(dt);
    updateTexts(dt);
    return events;
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.96, dt * 60);
      p.vy *= Math.pow(0.96, dt * 60);
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updateTexts(dt) {
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.life -= dt * 0.9;
      t.y -= 26 * dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
  }

  reset();
  return { state, reset, step };
}
