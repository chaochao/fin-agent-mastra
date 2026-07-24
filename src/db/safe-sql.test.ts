import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSelect, runSafeSqlOn, UnsafeSqlError, MAX_ROWS } from './safe-sql.ts';
import { openDb } from './index.ts';
import { seedInto } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));

// A fresh in-memory DB seeded with the deterministic dataset for query tests.
function seededDb() {
  const db = openDb(':memory:');
  seedInto(db);
  return db;
}

// --- validateSelect: the guard --------------------------------------------

test('accepts a plain SELECT and a WITH/CTE', () => {
  assert.equal(validateSelect('SELECT 1'), 'SELECT 1');
  assert.equal(
    validateSelect('WITH x AS (SELECT 1 AS n) SELECT n FROM x'),
    'WITH x AS (SELECT 1 AS n) SELECT n FROM x',
  );
});

test('strips a trailing semicolon but rejects internal ones', () => {
  assert.equal(validateSelect('SELECT 1;'), 'SELECT 1');
  assert.throws(() => validateSelect('SELECT 1; DROP TABLE transactions'), UnsafeSqlError);
});

test('rejects writes and DDL', () => {
  for (const q of [
    'DROP TABLE transactions',
    'DELETE FROM transactions',
    'UPDATE transactions SET amount = 0',
    'INSERT INTO accounts (name) VALUES ("x")',
    'ALTER TABLE accounts ADD COLUMN x TEXT',
    'CREATE TABLE t (id INT)',
    'ATTACH DATABASE "evil.db" AS e',
    'PRAGMA table_info(transactions)',
  ]) {
    assert.throws(() => validateSelect(q), UnsafeSqlError, `should reject: ${q}`);
  }
});

test('rejects comments (could hide intent)', () => {
  assert.throws(() => validateSelect('SELECT 1 -- drop'), UnsafeSqlError);
  assert.throws(() => validateSelect('SELECT 1 /* x */'), UnsafeSqlError);
});

test('does not false-reject banned words inside string literals', () => {
  const q = "SELECT * FROM transactions WHERE description LIKE '%update%'";
  assert.equal(validateSelect(q), q);
});

// --- runSafeSqlOn: execution + rails ---------------------------------------

test('auto-appends LIMIT when absent', () => {
  const db = seededDb();
  const res = runSafeSqlOn(db, 'SELECT id FROM transactions', 5);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.rowCount, 5);
    assert.equal(res.truncated, true);
  }
});

test('respects an explicit LIMIT', () => {
  const db = seededDb();
  const res = runSafeSqlOn(db, 'SELECT id FROM transactions LIMIT 2', MAX_ROWS);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.rowCount, 2);
});

test('returns ok:false with the error text (feeds the retry loop)', () => {
  const db = seededDb();
  const bad = runSafeSqlOn(db, 'SELECT nope FROM transactions', 10);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /no such column/i);

  const unsafe = runSafeSqlOn(db, 'DELETE FROM transactions', 10);
  assert.equal(unsafe.ok, false);
});

test('read-only connection physically rejects writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fin-ro-'));
  const path = join(dir, 'test.db');
  try {
    const w = openDb(path); // writable, applies schema
    seedInto(w);
    w.close();
    const ro = new Database(path, { readonly: true });
    assert.throws(() => ro.prepare('DELETE FROM transactions').run(), /readonly|read-only/i);
    ro.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the six north-star questions run cleanly through the rails ------------

test('all six north-star questions return sensible values via the rails', () => {
  const db = seededDb();
  const val = (sql: string, key: string) => {
    const r = runSafeSqlOn(db, sql, MAX_ROWS);
    assert.equal(r.ok, true, sql);
    return (r as { ok: true; rows: any[] }).rows[0]?.[key];
  };

  // Q1: software subscription spend, Q2 2026
  assert.ok(val("SELECT -SUM(amount) v FROM transactions WHERE category='software_subscriptions' AND amount<0 AND date BETWEEN '2026-04-01' AND '2026-06-30'", 'v') > 0);
  // Q2: top vendor by spend last quarter
  assert.ok(val("SELECT vendor v FROM transactions WHERE amount<0 AND vendor IS NOT NULL AND date BETWEEN '2026-04-01' AND '2026-06-30' GROUP BY vendor ORDER BY -SUM(amount) DESC LIMIT 1", 'v'));
  // Q3: revenue collected H1 2026
  assert.ok(val("SELECT SUM(amount) v FROM transactions WHERE transaction_type='payment' AND date BETWEEN '2026-01-01' AND '2026-06-30'", 'v') > 0);
  // Q4: overdue invoices outstanding
  assert.ok(val("SELECT SUM(amount) v FROM invoices WHERE status='overdue'", 'v') > 0);
  // Q5: 2025 operating expenses (exclude transfers)
  assert.ok(val("SELECT -SUM(amount) v FROM transactions WHERE amount<0 AND category<>'transfer' AND date BETWEEN '2025-01-01' AND '2025-12-31'", 'v') > 0);
  // Q6: duplicate-looking transactions exist
  const dupes = runSafeSqlOn(db, "SELECT vendor, amount, COUNT(*) c FROM transactions WHERE vendor IS NOT NULL GROUP BY vendor, amount HAVING c > 1", MAX_ROWS);
  assert.equal(dupes.ok, true);
  if (dupes.ok) assert.ok(dupes.rowCount > 0);
});
