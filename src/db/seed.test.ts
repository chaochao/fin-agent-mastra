import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './index.ts';
import { seedInto } from './seed.ts';

test('seedInto populates all tables', () => {
  const db = openDb(':memory:');
  const counts = seedInto(db);
  assert.equal(counts.accounts, 3);
  assert.equal(counts.customers, 10);
  assert.equal(counts.invoices, 50);
  assert.ok(counts.transactions >= 450 && counts.transactions <= 560);
});

test('seed is deterministic across two fresh DBs', () => {
  const dump = () => {
    const db = openDb(':memory:');
    seedInto(db);
    return db.prepare('SELECT account_id,date,amount,transaction_type,category,vendor,description,invoice_id FROM transactions ORDER BY date,amount,description').all();
  };
  assert.deepEqual(dump(), dump());
});

test('the six north-star questions return sensible values', () => {
  const db = openDb(':memory:');
  seedInto(db);
  const one = (sql: string) => db.prepare(sql).get() as any;

  const q1 = one("SELECT -SUM(amount) v FROM transactions WHERE category='software_subscriptions' AND amount<0 AND date BETWEEN '2026-04-01' AND '2026-06-30'");
  assert.ok(q1.v > 0);

  const q2 = one("SELECT vendor, -SUM(amount) v FROM transactions WHERE amount<0 AND vendor IS NOT NULL AND date BETWEEN '2026-04-01' AND '2026-06-30' GROUP BY vendor ORDER BY v DESC LIMIT 1");
  assert.ok(q2.vendor && q2.v > 0);

  const q3 = one("SELECT SUM(amount) v FROM transactions WHERE transaction_type='payment' AND date BETWEEN '2026-01-01' AND '2026-06-30'");
  assert.ok(q3.v > 0);

  const q4 = one("SELECT COUNT(*) n, SUM(amount) v FROM invoices WHERE status='overdue'");
  assert.ok(q4.n > 0 && q4.v > 0);

  const q5 = one("SELECT -SUM(amount) v FROM transactions WHERE amount<0 AND category<>'transfer' AND date BETWEEN '2025-01-01' AND '2025-12-31'");
  assert.ok(q5.v > 0);

  const q6 = db.prepare("SELECT vendor, amount, COUNT(*) c FROM transactions WHERE vendor IS NOT NULL GROUP BY vendor, amount HAVING c > 1").all();
  assert.ok(q6.length > 0);
});
