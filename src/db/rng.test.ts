import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.ts';

test('same seed produces identical sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('different seeds diverge', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('randInt is within inclusive bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const n = r.randInt(3, 9);
    assert.ok(n >= 3 && n <= 9, `out of range: ${n}`);
    assert.equal(Number.isInteger(n), true);
  }
});

test('two rngs with same seed stay in lockstep', () => {
  const a = createRng(99);
  const b = createRng(99);
  for (let i = 0; i < 20; i++) assert.equal(a.randInt(0, 100), b.randInt(0, 100));
  assert.equal(a.pick(['x', 'y']), b.pick(['x', 'y']));
  assert.equal(a.chance(0.3), b.chance(0.3));
});
