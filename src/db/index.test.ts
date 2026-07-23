import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './index.ts';

test('openDb creates all four tables', () => {
  const db = openDb(':memory:');
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r: any) => r.name);
  for (const t of ['accounts', 'customers', 'invoices', 'transactions']) {
    assert.ok(names.includes(t), `missing table: ${t}`);
  }
});

test('transactions has the expected columns', () => {
  const db = openDb(':memory:');
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map((r: any) => r.name);
  for (const c of ['id', 'account_id', 'date', 'amount', 'transaction_type', 'category', 'vendor', 'description', 'invoice_id']) {
    assert.ok(cols.includes(c), `missing column: ${c}`);
  }
});

test('foreign keys are enforced', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO invoices (customer_id, invoice_number, issue_date, due_date, amount, status) VALUES (999,'INV-X','2026-01-01','2026-02-01',100,'open')").run();
  });
});
