// Deterministic pseudo-random number generation for reproducible synthetic
// demonstration data. NOT cryptographically secure — used only to generate
// [SIMULATED] signals and datasets with a fixed, documented seed so results
// are reproducible across sessions and users.

export const DEFAULT_SEED = 20240601;

/** mulberry32 PRNG — small, fast, deterministic for a given seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private rand: () => number;
  readonly seed: number;

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.rand = mulberry32(seed);
  }

  /** Uniform random in [0, 1) */
  next(): number {
    return this.rand();
  }

  /** Uniform random in [min, max) */
  range(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  /** Gaussian (normal) random via Box-Muller transform. */
  gaussian(mean = 0, std = 1): number {
    const u1 = Math.max(this.rand(), 1e-12);
    const u2 = this.rand();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * std;
  }

  /** Random integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}
