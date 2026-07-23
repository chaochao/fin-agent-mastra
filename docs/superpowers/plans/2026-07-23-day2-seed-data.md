# Day 2 Seed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a deterministic, realistic SaaS-startup financial dataset and load it into `data/finance.db` (SQLite) for the Day 3 query tool and Day 8 evals to build on.

**Architecture:** Pure generator functions produce plain-object arrays (no DB), driven by a seeded `mulberry32` PRNG for determinism. A thin connection module applies the SQL schema. A `seed.ts` orchestrator wires generators → inserts → prints a summary. Tests use Node's built-in `node --test` runner against in-memory SQLite and assert structural invariants, not pre-guessed totals.

**Tech Stack:** Node.js 22.18+ (native `.ts` execution + built-in test runner), `better-sqlite3`, raw SQL.

## Global Constraints

- Runtime: Node.js 22.18+ with **npm** (no Bun). Local relative imports include the `.ts` extension.
- Determinism: all randomness flows through one seeded `mulberry32(SEED)` instance; `SEED = 42`. Re-running `seed.ts` MUST produce byte-identical row data.
- Fixed anchor: `ANCHOR_DATE = '2026-06-30'`; data spans `2025-01-01` → `2026-06-30`. No use of `Date.now()` in generation.
- Amounts: signed `REAL` (− = money out, + = money in). Invoice amounts always positive.
- `data/finance.db` stays gitignored; source under `src/db/` and `docs/north-star-questions.md` are committed.
- No ORM. USD only. Test runner: `node --test` (no test-framework dependency).

---

## File Structure

- `src/db/rng.ts` — seeded PRNG (`mulberry32`) + helpers (`randInt`, `randFloat`, `pick`, `chance`, `shuffle`). One responsibility: deterministic randomness.
- `src/db/schema.sql` — DDL for the 4 tables + indexes.
- `src/db/index.ts` — `openDb(path)` opens a `better-sqlite3` DB and applies `schema.sql`; default export opens `data/finance.db`.
- `src/db/generate.ts` — pure generators: accounts, customers, invoices, transactions. Returns arrays of typed objects. No DB, no I/O.
- `src/db/seed.ts` — orchestrator: open DB, run generators, bulk-insert in a transaction, print summary. Run via `npm run seed`.
- `src/db/rng.test.ts`, `src/db/generate.test.ts`, `src/db/seed.test.ts` — `node --test` suites.
- `docs/north-star-questions.md` — the 6 questions.
- `package.json` — add `seed` and `test` scripts + `better-sqlite3` deps.

---

### Task 1: Seeded PRNG utility

**Files:**
- Create: `src/db/rng.ts`
- Test: `src/db/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createRng(seed: number): Rng`
  - `type Rng = { next(): number; randInt(min: number, max: number): number; randFloat(min: number, max: number): number; pick<T>(arr: readonly T[]): T; chance(p: number): boolean; shuffle<T>(arr: readonly T[]): T[] }`
  - `next()` returns float in [0,1); `randInt` inclusive both ends.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/rng.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.ts';

test('same seed produces identical sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('randInt is within inclusive bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const n = r.randInt(3, 9);
    assert.ok(n >= 3 && n <= 9, `out of range: ${n}`);
    assert.equal(Number.isInteger(n), true);
  }
});

test('pick returns a member and chance is deterministic', () => {
  const r = createRng(7);
  const arr = ['a', 'b', 'c'] as const;
  assert.ok(arr.includes(r.pick(arr)));
  const r2 = createRng(7);
  const trials = Array.from({ length: 5 }, () => r.chance(0.5));
  const trials2 = Array.from({ length: 5 }, () => r2.chance(0.5));
  // r advanced by pick once; align r2 the same way
  r2.pick(arr);
  assert.deepEqual(trials, Array.from({ length: 5 }, () => createRng(7).chance(0.5)) .map((_, i) => trials[i]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/rng.test.ts`
Expected: FAIL — cannot find module `./rng.ts` / `createRng` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/db/rng.ts
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
```

- [ ] **Step 4: Simplify the `pick`/`chance` test**

Replace the brittle fourth test with a straightforward determinism check:

```ts
test('two rngs with same seed stay in lockstep', () => {
  const a = createRng(99);
  const b = createRng(99);
  for (let i = 0; i < 20; i++) {
    assert.equal(a.randInt(0, 100), b.randInt(0, 100));
  }
  assert.equal(a.pick(['x', 'y']), b.pick(['x', 'y']));
  assert.equal(a.chance(0.3), b.chance(0.3));
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/db/rng.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/rng.ts src/db/rng.test.ts
git commit -m "Day 2: deterministic seeded PRNG utility"
```

---

### Task 2: Schema + connection module

**Files:**
- Create: `src/db/schema.sql`, `src/db/index.ts`
- Modify: `package.json` (add `better-sqlite3`, `@types/better-sqlite3`, scripts)
- Test: `src/db/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `openDb(path: string): Database` (from `better-sqlite3`) with schema applied and `PRAGMA foreign_keys = ON`.
  - default export: a lazily-opened DB at `data/finance.db`.
  - Tables: `accounts, customers, invoices, transactions` with columns exactly as in the spec.

- [ ] **Step 1: Install driver and add scripts**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

Add to `package.json` `"scripts"`:

```json
"seed": "node src/db/seed.ts",
"test": "node --test"
```

- [ ] **Step 2: Write the failing test**

```ts
// src/db/index.test.ts
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
  for (const c of ['id','account_id','date','amount','transaction_type','category','vendor','description','invoice_id']) {
    assert.ok(cols.includes(c), `missing column: ${c}`);
  }
});

test('foreign keys are enforced', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO invoices (customer_id, invoice_number, issue_date, due_date, amount, status) VALUES (999,'INV-X','2026-01-01','2026-02-01',100,'open')").run();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test src/db/index.test.ts`
Expected: FAIL — `./index.ts` / `openDb` not found.

- [ ] **Step 4: Write the schema**

```sql
-- src/db/schema.sql
CREATE TABLE accounts (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card')),
  currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  payment_terms TEXT NOT NULL CHECK (payment_terms IN ('net_15','net_30','net_60'))
);

CREATE TABLE invoices (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  issue_date     TEXT NOT NULL,
  due_date       TEXT NOT NULL,
  amount         REAL NOT NULL CHECK (amount > 0),
  status         TEXT NOT NULL CHECK (status IN ('paid','open','overdue')),
  paid_date      TEXT
);

CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  date             TEXT NOT NULL,
  amount           REAL NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge','payment','refund','transfer','fee','payout')),
  category         TEXT NOT NULL,
  vendor           TEXT,
  description      TEXT NOT NULL,
  invoice_id       INTEGER REFERENCES invoices(id)
);

CREATE INDEX idx_tx_date     ON transactions(date);
CREATE INDEX idx_tx_category ON transactions(category);
CREATE INDEX idx_tx_type     ON transactions(transaction_type);
CREATE INDEX idx_tx_vendor   ON transactions(vendor);
CREATE INDEX idx_inv_status  ON invoices(status);
```

- [ ] **Step 5: Write the connection module**

```ts
// src/db/index.ts
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, 'schema.sql'), 'utf8');
export const DB_PATH = join(here, '..', '..', 'data', 'finance.db');

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

let _db: Database.Database | undefined;
export default function db(): Database.Database {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}
```

Note: `openDb` always applies the schema, so callers pass a fresh/empty path (`:memory:` in tests, a rebuilt file in `seed.ts`). The default export just opens an existing file for read (Day 3 tool use) and does NOT re-apply schema.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test src/db/index.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.sql src/db/index.ts src/db/index.test.ts package.json package-lock.json
git commit -m "Day 2: SQLite schema + connection module"
```

---

### Task 3: Reference-data generators (accounts + customers)

**Files:**
- Create: `src/db/generate.ts`
- Test: `src/db/generate.test.ts`

**Interfaces:**
- Consumes: `createRng` from `./rng.ts`.
- Produces:
  - `const SEED = 42`, `const ANCHOR = '2026-06-30'`
  - `type Account = { id: number; name: string; type: 'checking'|'savings'|'credit_card'; currency: 'USD' }`
  - `type Customer = { id: number; name: string; email: string; payment_terms: 'net_15'|'net_30'|'net_60' }`
  - `generateAccounts(): Account[]` — 3 fixed accounts.
  - `generateCustomers(rng: Rng): Customer[]` — 10 customers.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/generate.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.ts';
import { generateAccounts, generateCustomers, SEED } from './generate.ts';

test('accounts: exactly 3 with unique ids and valid types', () => {
  const accts = generateAccounts();
  assert.equal(accts.length, 3);
  assert.equal(new Set(accts.map(a => a.id)).size, 3);
  for (const a of accts) assert.ok(['checking','savings','credit_card'].includes(a.type));
});

test('customers: exactly 10, deterministic for the seed', () => {
  const a = generateCustomers(createRng(SEED));
  const b = generateCustomers(createRng(SEED));
  assert.equal(a.length, 10);
  assert.deepEqual(a, b);
  for (const c of a) assert.ok(['net_15','net_30','net_60'].includes(c.payment_terms));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/generate.test.ts`
Expected: FAIL — `generate.ts` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/db/generate.ts
import { createRng, type Rng } from './rng.ts';

export const SEED = 42;
export const ANCHOR = '2026-06-30';
export const START = '2025-01-01';

export type Account = { id: number; name: string; type: 'checking'|'savings'|'credit_card'; currency: 'USD' };
export type Customer = { id: number; name: string; email: string; payment_terms: 'net_15'|'net_30'|'net_60' };

export function generateAccounts(): Account[] {
  return [
    { id: 1, name: 'Operating Checking', type: 'checking', currency: 'USD' },
    { id: 2, name: 'Business Savings', type: 'savings', currency: 'USD' },
    { id: 3, name: 'Amex Corporate', type: 'credit_card', currency: 'USD' },
  ];
}

const CUSTOMER_NAMES = [
  'Northwind Retail', 'Contoso Media', 'Fabrikam Logistics', 'Adventure Works',
  'Tailspin Toys', 'Wingtip Software', 'Proseware Health', 'Litware Finance',
  'Alpine Ski House', 'Coho Winery',
] as const;
const TERMS = ['net_15','net_30','net_60'] as const;

export function generateCustomers(rng: Rng): Customer[] {
  return CUSTOMER_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    email: `ap@${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
    payment_terms: rng.pick(TERMS),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/db/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/generate.ts src/db/generate.test.ts
git commit -m "Day 2: account + customer generators"
```

---

### Task 4: Invoice generator

**Files:**
- Modify: `src/db/generate.ts`
- Modify: `src/db/generate.test.ts`

**Interfaces:**
- Consumes: `Customer`, `Rng`, `ANCHOR`, date helpers.
- Produces:
  - `type Invoice = { id: number; customer_id: number; invoice_number: string; issue_date: string; due_date: string; amount: number; status: 'paid'|'open'|'overdue'; paid_date: string | null }`
  - `generateInvoices(rng: Rng, customers: Customer[]): Invoice[]` — exactly 50 invoices.
  - Helper `addDays(iso: string, days: number): string` and `daysBetween(a,b)` exported for reuse in Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/db/generate.test.ts
import { generateInvoices } from './generate.ts';

test('invoices: 50 rows, valid statuses, overdue subset exists', () => {
  const rng = createRng(SEED);
  const custs = generateCustomers(rng);
  const invs = generateInvoices(rng, custs);
  assert.equal(invs.length, 50);
  assert.equal(new Set(invs.map(i => i.invoice_number)).size, 50); // unique
  for (const inv of invs) {
    assert.ok(inv.amount > 0);
    assert.ok(['paid','open','overdue'].includes(inv.status));
    assert.equal(inv.status === 'paid', inv.paid_date !== null);
    assert.ok(custs.some(c => c.id === inv.customer_id));
  }
  assert.ok(invs.some(i => i.status === 'overdue'), 'expected some overdue invoices');
  assert.ok(invs.some(i => i.status === 'paid'), 'expected some paid invoices');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/generate.test.ts`
Expected: FAIL — `generateInvoices` not exported.

- [ ] **Step 3: Add date helpers + invoice generator**

```ts
// add to src/db/generate.ts
const TERM_DAYS: Record<Customer['payment_terms'], number> = { net_15: 15, net_30: 30, net_60: 60 };

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime();
  return Math.round(ms / 86400000);
}

export type Invoice = {
  id: number; customer_id: number; invoice_number: string;
  issue_date: string; due_date: string; amount: number;
  status: 'paid'|'open'|'overdue'; paid_date: string | null;
};

export function generateInvoices(rng: Rng, customers: Customer[]): Invoice[] {
  const total = daysBetween(START, ANCHOR); // ~546 days
  const invoices: Invoice[] = [];
  for (let i = 0; i < 50; i++) {
    const cust = rng.pick(customers);
    const issue = addDays(START, rng.randInt(0, total)); // may be before or after anchor is bounded by total
    const due = addDays(issue, TERM_DAYS[cust.payment_terms]);
    const amount = Math.round(rng.randFloat(800, 24000) * 100) / 100;
    let status: Invoice['status'];
    let paid_date: string | null = null;
    if (rng.chance(0.7)) {
      // paid: paid somewhere between issue and due (+/- a few days)
      status = 'paid';
      paid_date = addDays(issue, rng.randInt(3, TERM_DAYS[cust.payment_terms] + 5));
    } else if (due < ANCHOR) {
      status = 'overdue';
    } else {
      status = 'open';
    }
    invoices.push({
      id: i + 1,
      customer_id: cust.id,
      invoice_number: `INV-${issue.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`,
      issue_date: issue,
      due_date: due,
      amount,
      status,
      paid_date,
    });
  }
  return invoices;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/db/generate.test.ts`
Expected: PASS. (If no overdue rows appear for SEED=42, the test fails loudly — adjust the paid-chance down or seed; do NOT weaken the assertion.)

- [ ] **Step 5: Commit**

```bash
git add src/db/generate.ts src/db/generate.test.ts
git commit -m "Day 2: invoice generator with paid/open/overdue statuses"
```

---

### Task 5: Transaction generator

**Files:**
- Modify: `src/db/generate.ts`
- Modify: `src/db/generate.test.ts`

**Interfaces:**
- Consumes: `Account`, `Invoice`, `Rng`, date helpers, `START`, `ANCHOR`.
- Produces:
  - `type Transaction = { account_id: number; date: string; amount: number; transaction_type: 'charge'|'payment'|'refund'|'transfer'|'fee'|'payout'; category: string; vendor: string | null; description: string; invoice_id: number | null }` (id assigned at insert time)
  - `generateTransactions(rng: Rng, accounts: Account[], invoices: Invoice[]): Transaction[]`
  - Invariants (asserted in tests): one `payment` per `paid` invoice; `charge`/`payout`/`fee` amounts < 0; `payment` amounts > 0; `refund` amounts > 0 with an expense `category`; `transfer` rows have `category='transfer'`; total rows in [450, 560].

- [ ] **Step 1: Write the failing test**

```ts
// add to src/db/generate.test.ts
import { generateAccounts, generateTransactions } from './generate.ts';

test('transactions: invariants hold', () => {
  const rng = createRng(SEED);
  const custs = generateCustomers(rng);
  const invs = generateInvoices(rng, custs);
  const accts = generateAccounts();
  const txs = generateTransactions(rng, accts, invs);

  assert.ok(txs.length >= 450 && txs.length <= 560, `count ${txs.length}`);

  const paidCount = invs.filter(i => i.status === 'paid').length;
  const payments = txs.filter(t => t.transaction_type === 'payment');
  assert.equal(payments.length, paidCount, 'one payment per paid invoice');
  for (const p of payments) {
    assert.ok(p.amount > 0);
    assert.notEqual(p.invoice_id, null);
  }

  for (const t of txs) {
    if (['charge','payout','fee'].includes(t.transaction_type)) assert.ok(t.amount < 0, `${t.transaction_type} should be negative`);
    if (t.transaction_type === 'refund') { assert.ok(t.amount > 0); assert.notEqual(t.category, 'revenue'); }
    if (t.transaction_type === 'transfer') assert.equal(t.category, 'transfer');
    assert.ok(t.date >= '2025-01-01' && t.date <= '2026-06-30', `date out of range: ${t.date}`);
  }

  assert.ok(txs.some(t => t.transaction_type === 'refund'), 'expected refunds');
  assert.ok(txs.some(t => t.transaction_type === 'transfer'), 'expected transfers');
  // recurring subscription: same vendor+amount appears in multiple months
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/generate.test.ts`
Expected: FAIL — `generateTransactions` not exported.

- [ ] **Step 3: Implement the transaction generator**

```ts
// add to src/db/generate.ts
export type Transaction = {
  account_id: number; date: string; amount: number;
  transaction_type: 'charge'|'payment'|'refund'|'transfer'|'fee'|'payout';
  category: string; vendor: string | null; description: string; invoice_id: number | null;
};

const SOFTWARE_VENDORS = ['Figma','Notion','Slack','GitHub','Linear','Vercel','Datadog','HubSpot'] as const;
const CLOUD_VENDORS = ['AWS','GCP'] as const;
const CONTRACTORS = ['J. Rivera (design)','P. Okafor (backend)','M. Chen (content)'] as const;

// list of first-of-month dates from START..ANCHOR
function monthsInRange(): string[] {
  const out: string[] = [];
  let y = 2025, m = 1;
  while (y < 2026 || (y === 2026 && m <= 6)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out; // Jan 2025 .. Jun 2026 = 18 months
}

export function generateTransactions(rng: Rng, accounts: Account[], invoices: Invoice[]): Transaction[] {
  const txs: Transaction[] = [];
  const checking = accounts.find(a => a.type === 'checking')!;
  const savings = accounts.find(a => a.type === 'savings')!;
  const card = accounts.find(a => a.type === 'credit_card')!;
  const months = monthsInRange();

  // Fixed monthly recurring amounts per software vendor (deterministic, same every month).
  const softwarePrice: Record<string, number> = {};
  for (const v of SOFTWARE_VENDORS) softwarePrice[v] = rng.randInt(20, 400);
  const cloudBase: Record<string, number> = {};
  for (const v of CLOUD_VENDORS) cloudBase[v] = rng.randInt(1500, 6000);

  for (const first of months) {
    const day = (n: number) => addDays(first, n);
    // recurring software subscriptions (charge, card)
    for (const v of SOFTWARE_VENDORS) {
      txs.push({ account_id: card.id, date: day(rng.randInt(0, 5)), amount: -softwarePrice[v],
        transaction_type: 'charge', category: 'software_subscriptions', vendor: v,
        description: `${v} monthly subscription`, invoice_id: null });
    }
    // cloud infra (charge, varies month to month around base)
    for (const v of CLOUD_VENDORS) {
      const amt = Math.round((cloudBase[v] * rng.randFloat(0.8, 1.3)) * 100) / 100;
      txs.push({ account_id: card.id, date: day(rng.randInt(1, 6)), amount: -amt,
        transaction_type: 'charge', category: 'cloud_infrastructure', vendor: v,
        description: `${v} cloud usage`, invoice_id: null });
    }
    // payroll (payout, checking) twice a month
    for (const d of [1, 15]) {
      txs.push({ account_id: checking.id, date: day(d), amount: -rng.randInt(28000, 42000),
        transaction_type: 'payout', category: 'payroll', vendor: 'Gusto',
        description: 'Payroll run', invoice_id: null });
    }
    // contractors (payout) — ~2 of 3 each month
    for (const c of CONTRACTORS) {
      if (rng.chance(0.66)) {
        txs.push({ account_id: checking.id, date: day(rng.randInt(5, 25)), amount: -rng.randInt(1500, 7000),
          transaction_type: 'payout', category: 'contractors', vendor: c,
          description: `Contractor payment — ${c}`, invoice_id: null });
      }
    }
    // marketing (charge)
    txs.push({ account_id: card.id, date: day(rng.randInt(2, 20)), amount: -rng.randInt(500, 5000),
      transaction_type: 'charge', category: 'marketing', vendor: 'Google Ads',
      description: 'Ad spend', invoice_id: null });
    // office (charge)
    txs.push({ account_id: checking.id, date: day(rng.randInt(1, 3)), amount: -rng.randInt(1800, 2600),
      transaction_type: 'charge', category: 'office', vendor: 'WeWork',
      description: 'Office membership', invoice_id: null });
    // bank fee (fee)
    txs.push({ account_id: checking.id, date: day(rng.randInt(1, 28)), amount: -rng.randInt(15, 60),
      transaction_type: 'fee', category: 'bank_fees', vendor: null,
      description: 'Monthly account fee', invoice_id: null });
    // occasional travel / professional services / taxes
    if (rng.chance(0.5)) txs.push({ account_id: card.id, date: day(rng.randInt(3, 27)), amount: -rng.randInt(300, 3500),
      transaction_type: 'charge', category: 'travel', vendor: 'Concur', description: 'Business travel', invoice_id: null });
    if (rng.chance(0.4)) txs.push({ account_id: checking.id, date: day(rng.randInt(3, 27)), amount: -rng.randInt(500, 6000),
      transaction_type: 'charge', category: 'professional_services', vendor: 'Baker & Co (legal)', description: 'Legal/advisory', invoice_id: null });
  }

  // quarterly estimated taxes (charge)
  for (const d of ['2025-04-15','2025-06-15','2025-09-15','2026-01-15','2026-04-15']) {
    txs.push({ account_id: checking.id, date: d, amount: -rng.randInt(9000, 20000),
      transaction_type: 'charge', category: 'taxes', vendor: 'IRS', description: 'Estimated quarterly tax', invoice_id: null });
  }

  // payments: exactly one per paid invoice (income), plus a Stripe processing fee
  for (const inv of invoices) {
    if (inv.status !== 'paid' || !inv.paid_date) continue;
    txs.push({ account_id: checking.id, date: inv.paid_date, amount: inv.amount,
      transaction_type: 'payment', category: 'revenue', vendor: null,
      description: `Payment for ${inv.invoice_number}`, invoice_id: inv.id });
    const fee = Math.round(inv.amount * 0.029 * 100) / 100 + 0.30;
    txs.push({ account_id: checking.id, date: inv.paid_date, amount: -fee,
      transaction_type: 'fee', category: 'payment_processing', vendor: 'Stripe',
      description: `Processing fee for ${inv.invoice_number}`, invoice_id: inv.id });
  }

  // refunds: 6 positive amounts on an expense category (cancelled SaaS seats)
  for (let i = 0; i < 6; i++) {
    const v = rng.pick(SOFTWARE_VENDORS);
    txs.push({ account_id: card.id, date: addDays(START, rng.randInt(30, daysBetween(START, ANCHOR))),
      amount: rng.randInt(20, 400), transaction_type: 'refund', category: 'software_subscriptions',
      vendor: v, description: `Refund — cancelled ${v} seat`, invoice_id: null });
  }

  // transfers: 5 checking -> savings (single row each; internal, excluded from P&L)
  for (let i = 0; i < 5; i++) {
    txs.push({ account_id: savings.id, date: addDays(START, rng.randInt(60, daysBetween(START, ANCHOR))),
      amount: rng.randInt(10000, 40000), transaction_type: 'transfer', category: 'transfer',
      vendor: null, description: 'Transfer from checking to savings', invoice_id: null });
  }

  return rng.shuffle(txs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/db/generate.test.ts`
Expected: PASS. If the row count lands outside [450,560], adjust the `chance()` probabilities (not the assertion) until it fits; re-run.

- [ ] **Step 5: Commit**

```bash
git add src/db/generate.ts src/db/generate.test.ts
git commit -m "Day 2: transaction generator (charges, payouts, payments, fees, refunds, transfers)"
```

---

### Task 6: Seed orchestrator + north-star questions + end-to-end verification

**Files:**
- Create: `src/db/seed.ts`, `docs/north-star-questions.md`
- Test: `src/db/seed.test.ts`

**Interfaces:**
- Consumes: `openDb` (Task 2), all generators (Tasks 3–5), `SEED`.
- Produces:
  - `seedInto(db: Database): { accounts: number; customers: number; invoices: number; transactions: number }` — inserts all rows in one transaction, returns counts.
  - `seed.ts` as a runnable script (rebuilds `data/finance.db`, prints summary).

- [ ] **Step 1: Write the failing test**

```ts
// src/db/seed.test.ts
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
  const one = (sql: string) => (db.prepare(sql).get() as any);

  // Q1: software subscription spend in Q2 2026 (money out only)
  const q1 = one("SELECT -SUM(amount) v FROM transactions WHERE category='software_subscriptions' AND amount<0 AND date BETWEEN '2026-04-01' AND '2026-06-30'");
  assert.ok(q1.v > 0);

  // Q2: top vendor by spend last quarter (Q2 2026)
  const q2 = one("SELECT vendor, -SUM(amount) v FROM transactions WHERE amount<0 AND vendor IS NOT NULL AND date BETWEEN '2026-04-01' AND '2026-06-30' GROUP BY vendor ORDER BY v DESC LIMIT 1");
  assert.ok(q2.vendor && q2.v > 0);

  // Q3: revenue collected H1 2026
  const q3 = one("SELECT SUM(amount) v FROM transactions WHERE transaction_type='payment' AND date BETWEEN '2026-01-01' AND '2026-06-30'");
  assert.ok(q3.v > 0);

  // Q4: overdue invoices outstanding
  const q4 = one("SELECT COUNT(*) n, SUM(amount) v FROM invoices WHERE status='overdue'");
  assert.ok(q4.n > 0 && q4.v > 0);

  // Q5: total operating expenses 2025 (exclude transfers; money out)
  const q5 = one("SELECT -SUM(amount) v FROM transactions WHERE amount<0 AND category<>'transfer' AND date BETWEEN '2025-01-01' AND '2025-12-31'");
  assert.ok(q5.v > 0);

  // Q6: duplicate-looking transactions (same vendor+amount, multiple rows)
  const q6 = db.prepare("SELECT vendor, amount, COUNT(*) c FROM transactions WHERE vendor IS NOT NULL GROUP BY vendor, amount HAVING c > 1").all();
  assert.ok(q6.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/seed.test.ts`
Expected: FAIL — `seed.ts` / `seedInto` not found.

- [ ] **Step 3: Implement the orchestrator**

```ts
// src/db/seed.ts
import type Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { openDb, DB_PATH } from './index.ts';
import {
  SEED, generateAccounts, generateCustomers, generateInvoices, generateTransactions,
} from './generate.ts';
import { createRng } from './rng.ts';

export function seedInto(db: Database.Database) {
  const rng = createRng(SEED);
  const accounts = generateAccounts();
  const customers = generateCustomers(rng);
  const invoices = generateInvoices(rng, customers);
  const transactions = generateTransactions(rng, accounts, invoices);

  const insertAccount = db.prepare('INSERT INTO accounts (id,name,type,currency) VALUES (@id,@name,@type,@currency)');
  const insertCustomer = db.prepare('INSERT INTO customers (id,name,email,payment_terms) VALUES (@id,@name,@email,@payment_terms)');
  const insertInvoice = db.prepare('INSERT INTO invoices (id,customer_id,invoice_number,issue_date,due_date,amount,status,paid_date) VALUES (@id,@customer_id,@invoice_number,@issue_date,@due_date,@amount,@status,@paid_date)');
  const insertTx = db.prepare('INSERT INTO transactions (account_id,date,amount,transaction_type,category,vendor,description,invoice_id) VALUES (@account_id,@date,@amount,@transaction_type,@category,@vendor,@description,@invoice_id)');

  const run = db.transaction(() => {
    for (const a of accounts) insertAccount.run(a);
    for (const c of customers) insertCustomer.run(c);
    for (const i of invoices) insertInvoice.run(i);
    for (const t of transactions) insertTx.run(t);
  });
  run();

  return { accounts: accounts.length, customers: customers.length, invoices: invoices.length, transactions: transactions.length };
}

// Run directly: rebuild data/finance.db from scratch.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  const db = openDb(DB_PATH);
  const counts = seedInto(db);
  console.log('Seeded data/finance.db:', counts);
  db.close();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the north-star questions doc**

```markdown
<!-- docs/north-star-questions.md -->
# North-star questions (Day 2 → Day 8 eval set)

The dataset is anchored to **2026-06-30**. These are the questions the agent must
eventually answer; they double as the Day 8 eval cases.

1. What did we spend on software subscriptions in Q2 2026? *(category + date range)*
2. Which vendor did we pay the most last quarter (Q2 2026)? *(GROUP BY vendor)*
3. How much revenue did we collect in H1 2026? *(income sum)*
4. Which invoices are currently overdue, and what's the total outstanding? *(invoice status)*
5. What were our total operating expenses in 2025 (excluding internal transfers)? *(full-year sum)*
6. Are there any duplicate-looking transactions — same vendor and amount within a few days? *(cross-row reasoning)*

Answers are produced from `data/finance.db` (run `npm run seed` to build it). The exact
figures are deterministic for `SEED=42`.
```

- [ ] **Step 6: Run the seed and the full suite end-to-end**

```bash
npm run seed
npm test
```

Expected: `Seeded data/finance.db: { accounts: 3, customers: 10, invoices: 50, transactions: <~500> }` and all test files PASS. Confirm `data/finance.db` exists and is NOT staged (gitignored).

- [ ] **Step 7: Commit**

```bash
git add src/db/seed.ts src/db/seed.test.ts docs/north-star-questions.md
git commit -m "Day 2: seed orchestrator, north-star questions, end-to-end verification"
```

---

## Self-Review

**Spec coverage:**
- 4 tables with exact columns → Tasks 2–5. ✓
- Signed amount + `transaction_type` (charge/payment/refund/transfer/fee/payout) → Task 5. ✓
- Deterministic `mulberry32`, SEED=42, anchor 2026-06-30, Jan 2025–Jun 2026 → Tasks 1, 3–5. ✓
- Row counts (3 / 10 / ~50 / ~500) → asserted in Tasks 3, 4, 5, 6. ✓
- `payment` 1:1 with paid invoices → Task 5 + test. ✓
- refunds positive-on-expense; transfers excluded from P&L → Task 5 + Q5 test. ✓
- Recurring subs same vendor+amount (feeds Q6) → Task 5 + test. ✓
- File layout `src/db/{schema.sql,index.ts,seed.ts}` + generators + questions doc → all tasks. ✓
- `npm run seed`; `data/finance.db` gitignored → Tasks 2, 6. ✓
- 6 north-star questions answerable → Task 6 test + doc. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `Rng`, `Account`, `Customer`, `Invoice`, `Transaction`, `createRng`, `generate*`, `openDb`, `seedInto`, `SEED`, `ANCHOR`, `START`, `addDays`, `daysBetween` are used consistently across tasks.

**Note for executor:** row-count and overdue/refund existence assertions depend on SEED=42's realized values. If any fails, adjust generation probabilities/counts (never weaken assertions), re-run, and confirm determinism still holds.
