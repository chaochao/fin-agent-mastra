export type Rng = {
  next(): number;
  randInt(min: number, max: number): number;
  randFloat(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: readonly T[]): T[];
};

// mulberry32: tiny, fast, well-distributed seeded PRNG.
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randFloat = (min: number, max: number) => min + next() * (max - min);
  const randInt = (min: number, max: number) => Math.floor(randFloat(min, max + 1));
  const pick = <T,>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];
  const chance = (p: number) => next() < p;
  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { next, randInt, randFloat, pick, chance, shuffle };
}
