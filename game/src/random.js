// A tiny seeded random source, so a seed always plays the same game.
// mulberry32: small, fast, and good enough for spawning and drift.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random number in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Pick one element of an array. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
