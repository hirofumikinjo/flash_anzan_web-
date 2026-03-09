function hashSeed(seedInput) {
  const value = String(seedInput);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createPrng(seedInput) {
  let state = hashSeed(seedInput) || 0x6d2b79f5;

  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(prng, min, max) {
  return Math.floor(prng() * (max - min + 1)) + min;
}

export function randomChoice(prng, items) {
  return items[randomInt(prng, 0, items.length - 1)];
}
