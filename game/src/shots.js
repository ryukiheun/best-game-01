// The screenshot scenes behind ?shot=start|play|boss|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (kite away from the nearest enemy, chase shards, aim
// with a lead, fire, and spend a charged Nova on a crowd), so the frame is
// what a short game really looks like and the same seed always gives the
// same frame.
import { FIELD, SHIP, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 52;
const BOSS_WAVE = 5;
const BOSS_AFTER_SECONDS = 8;
const END_GOOD_SECONDS = 20;
const END_LIMIT_SECONDS = 600;
const SAMPLE = STEP;

/** The nearest enemy to the ship, or null. */
function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    const dx = enemy.x - state.ship.x;
    const dy = enemy.y - state.ship.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return best;
}

/** The nearest shard, or null. */
function nearestShard(state) {
  let best = null;
  let bestD = Infinity;
  for (const shard of state.shards) {
    const dx = shard.x - state.ship.x;
    const dy = shard.y - state.ship.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = shard;
    }
  }
  return best;
}

/**
 * One step of input for the autopilot: move away from close enemies, toward
 * shards when safe, aim at the nearest enemy with a lead, and fire.
 */
function autopilot(state) {
  const ship = state.ship;
  let mx = 0;
  let my = 0;
  // Repulsion from every enemy inside 200px, stronger the closer it is.
  for (const enemy of state.enemies) {
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 200) {
      const push = (200 - d) / 200;
      mx += (dx / d) * push * 1.6;
      my += (dy / d) * push * 1.6;
    }
  }
  // Chase the nearest shard when nothing is close.
  const shard = nearestShard(state);
  if (shard && Math.abs(mx) + Math.abs(my) < 0.4) {
    const dx = shard.x - ship.x;
    const dy = shard.y - ship.y;
    const d = Math.hypot(dx, dy) || 1;
    mx += (dx / d) * 0.8;
    my += (dy / d) * 0.8;
  }
  // Stay in the action: a soft pull back from the edges so the ship does not
  // camp in a corner while the swarm gathers at the other side.
  const edge = 200;
  if (ship.x < edge) mx += (edge - ship.x) / edge;
  if (ship.x > FIELD.width - edge) mx -= (ship.x - (FIELD.width - edge)) / edge;
  if (ship.y < edge) my += (edge - ship.y) / edge;
  if (ship.y > FIELD.height - edge) my -= (ship.y - (FIELD.height - edge)) / edge;
  // Drift toward the centre when the field is empty.
  if (state.enemies.length === 0) {
    mx += (FIELD.width / 2 - ship.x) / FIELD.width;
    my += (FIELD.height / 2 - ship.y) / FIELD.height;
  }
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  // Aim at the nearest enemy, leading it by the bullet's flight time.
  const target = nearestEnemy(state);
  let aimX = null;
  let aimY = null;
  let fire = false;
  if (target) {
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const d = Math.hypot(dx, dy) || 1;
    const flight = d / SHIP.bulletSpeed;
    aimX = target.x + target.vx * flight;
    aimY = target.y + target.vy * flight;
    // Engage a little closer than a human could, so the swarm visibly closes
    // in before it dies instead of being sniped at the edge of the field.
    fire = d < 480;
  }
  // Spend a charged Nova on a crowd.
  let nova = false;
  if (ship.nova >= SHIP.novaMax) {
    let close = 0;
    for (const enemy of state.enemies) {
      const dx = enemy.x - ship.x;
      const dy = enemy.y - ship.y;
      if (dx * dx + dy * dy <= SHIP.novaRadius * SHIP.novaRadius) close += 1;
    }
    nova = close >= 4;
  }
  return { mx, my, aimX, aimY, fire, nova };
}

/** The passive pilot for the end scene: no fire, a slow drift, no dodging. */
function passivePilot(state) {
  return {
    mx: 0.15,
    my: 0.1,
    aimX: state.ship.x + 100,
    aimY: state.ship.y,
    fire: false,
    nova: false,
  };
}

/**
 * Set `world` to the named scene (start, play, boss or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / SAMPLE; i += 1) world.step(SAMPLE, { mx: 0, my: 0, aimX: null, aimY: null, fire: false, nova: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / SAMPLE; i += 1) {
      const events = world.step(SAMPLE, autopilot(world.state), false);
      if (events & (EVENT_OVER | EVENT_WIN)) break;
    }
    return { screen: world.state.won ? SCREEN_WIN : world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'boss') {
    // Play until the wave-5 dreadnought is on the field, then a few more seconds.
    let bossSeen = false;
    let after = 0;
    for (let i = 0; i < 900 / SAMPLE; i += 1) {
      const events = world.step(SAMPLE, autopilot(world.state), false);
      if (events & (EVENT_OVER | EVENT_WIN)) break;
      if (!bossSeen) {
        for (const enemy of world.state.enemies) {
          if (enemy.kind === 'dreadnought') bossSeen = true;
        }
      } else {
        after += SAMPLE;
        if (after >= BOSS_AFTER_SECONDS) break;
      }
      if (world.state.wave > BOSS_WAVE && !bossSeen) break;
    }
    return { screen: world.state.won ? SCREEN_WIN : world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // End: play well for a while, then stop fighting and let the swarm win.
  for (let i = 0; i < END_GOOD_SECONDS / SAMPLE; i += 1) {
    const events = world.step(SAMPLE, autopilot(world.state), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  for (let i = 0; i < END_LIMIT_SECONDS / SAMPLE; i += 1) {
    const events = world.step(SAMPLE, passivePilot(world.state), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  const over = world.state.over && !world.state.won;
  return { screen: over ? SCREEN_OVER : world.state.won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
}
