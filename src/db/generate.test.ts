import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.ts';
import {
  SEED, generateAccounts, generateCustomers, generateInvoices, generateTransactions,
} from './generate.ts';

test('accounts: exactly 3 with unique ids and valid types', () => {
  const accts = generateAccounts();
  assert.equal(accts.length, 3);
  assert.equal(new Set(accts.map(a => a.id)).size, 3);
  for (const a of accts) assert.ok(['checking', 'savings', 'credit_card'].includes(a.type));
});

test('customers: exactly 10, deterministic for the seed', () => {
  const a = generateCustomers(createRng(SEED));
  const b = generateCustomers(createRng(SEED));
  assert.equal(a.length, 10);
  assert.deepEqual(a, b);
  for (const c of a) assert.ok(['net_15', 'net_30', 'net_60'].includes(c.payment_terms));
});

test('invoices: 50 rows, valid statuses, overdue + paid subsets exist', () => {
  const rng = createRng(SEED);
  const custs = generateCustomers(rng);
  const invs = generateInvoices(rng, custs);
  assert.equal(invs.length, 50);
  assert.equal(new Set(invs.map(i => i.invoice_number)).size, 50);
  for (const inv of invs) {
    assert.ok(inv.amount > 0);
    assert.ok(['paid', 'open', 'overdue'].includes(inv.status));
    assert.equal(inv.status === 'paid', inv.paid_date !== null);
    assert.ok(custs.some(c => c.id === inv.customer_id));
  }
  assert.ok(invs.some(i => i.status === 'overdue'), 'expected some overdue invoices');
  assert.ok(invs.some(i => i.status === 'paid'), 'expected some paid invoices');
});

test('transactions: invariants hold', () => {
  const rng = createRng(SEED);
  const custs = generateCustomers(rng);
  const invs = generateInvoices(rng, custs);
  const txs = generateTransactions(rng, generateAccounts(), invs);

  assert.ok(txs.length >= 450 && txs.length <= 560, `count ${txs.length}`);

  const paidCount = invs.filter(i => i.status === 'paid').length;
  const payments = txs.filter(t => t.transaction_type === 'payment');
  assert.equal(payments.length, paidCount, 'one payment per paid invoice');
  for (const p of payments) {
    assert.ok(p.amount > 0);
    assert.notEqual(p.invoice_id, null);
  }

  for (const t of txs) {
    if (['charge', 'payout', 'fee'].includes(t.transaction_type)) assert.ok(t.amount < 0, `${t.transaction_type} should be negative`);
    if (t.transaction_type === 'refund') { assert.ok(t.amount > 0); assert.notEqual(t.category, 'revenue'); }
    if (t.transaction_type === 'transfer') assert.equal(t.category, 'transfer');
    assert.ok(t.date >= '2025-01-01' && t.date <= '2026-06-30', `date out of range: ${t.date}`);
  }

  assert.ok(txs.some(t => t.transaction_type === 'refund'), 'expected refunds');
  assert.ok(txs.some(t => t.transaction_type === 'transfer'), 'expected transfers');
  const figma = txs.filter(t => t.vendor === 'Figma');
  assert.ok(figma.length >= 12, 'expected recurring Figma charges');
});

test('transactions: deterministic for the seed', () => {
  const build = () => {
    const rng = createRng(SEED);
    const custs = generateCustomers(rng);
    const invs = generateInvoices(rng, custs);
    return generateTransactions(rng, generateAccounts(), invs);
  };
  assert.deepEqual(build(), build());
});
