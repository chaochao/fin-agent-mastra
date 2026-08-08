// Live eval — guarded text-to-SQL (run_sql): prove the AGENT answers correctly (needs DEEPSEEK_API_KEY).
// Run: npm run eval:sql
//
// For each question we compute a ground-truth value with our own SQL, ask the
// agent in natural language, then check the agent's answer against the truth.
// Numeric checks pass if any number in the answer is within 1% (or $1) of truth.
import Database from 'better-sqlite3';
import { mastra } from '../mastra/index.ts';
import { DB_PATH } from '../db/index.ts';

const db = new Database(DB_PATH, { readonly: true });
const num = (sql: string): number => Number((db.prepare(sql).get() as any)?.v ?? NaN);

type Check = (answer: string) => boolean;

// Pass if some number in `answer` is within tolerance of `expected`.
function nearNumber(expected: number, tolPct = 1, absTol = 1): Check {
  return (answer) => {
    const nums = (answer.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const tol = Math.max(absTol, Math.abs(expected) * (tolPct / 100));
    return nums.some((n) => Math.abs(n - expected) <= tol);
  };
}
const mentions = (s: string): Check => (answer) => answer.toLowerCase().includes(s.toLowerCase());
const all = (...cs: Check[]): Check => (answer) => cs.every((c) => c(answer));

// Ground-truth values from our own SQL.
const q2TopVendor = (db.prepare(
  "SELECT vendor v FROM transactions WHERE amount<0 AND vendor IS NOT NULL AND date BETWEEN '2026-04-01' AND '2026-06-30' GROUP BY vendor ORDER BY -SUM(amount) DESC LIMIT 1",
).get() as any).v as string;
const biggest = db.prepare(
  'SELECT vendor, amount FROM transactions WHERE amount<0 ORDER BY amount ASC LIMIT 1',
).get() as { vendor: string; amount: number };

const cases: { q: string; check: Check; truth: string }[] = [
  {
    q: 'What did we spend on software subscriptions in Q2 2026?',
    check: nearNumber(num("SELECT -SUM(amount) v FROM transactions WHERE category='software_subscriptions' AND amount<0 AND date BETWEEN '2026-04-01' AND '2026-06-30'")),
    truth: num("SELECT -SUM(amount) v FROM transactions WHERE category='software_subscriptions' AND amount<0 AND date BETWEEN '2026-04-01' AND '2026-06-30'").toFixed(2),
  },
  {
    q: 'Which vendor did we pay the most in Q2 2026?',
    check: mentions(q2TopVendor),
    truth: q2TopVendor,
  },
  {
    q: 'How much revenue did we collect in the first half of 2026?',
    check: nearNumber(num("SELECT SUM(amount) v FROM transactions WHERE transaction_type='payment' AND date BETWEEN '2026-01-01' AND '2026-06-30'")),
    truth: num("SELECT SUM(amount) v FROM transactions WHERE transaction_type='payment' AND date BETWEEN '2026-01-01' AND '2026-06-30'").toFixed(2),
  },
  {
    q: "Which invoices are overdue, and what's the total outstanding?",
    check: nearNumber(num("SELECT SUM(amount) v FROM invoices WHERE status='overdue'")),
    truth: num("SELECT SUM(amount) v FROM invoices WHERE status='overdue'").toFixed(2) + ' outstanding',
  },
  {
    q: 'What were our total operating expenses in 2025 (exclude internal transfers)?',
    check: nearNumber(num("SELECT -SUM(amount) v FROM transactions WHERE amount<0 AND category<>'transfer' AND date BETWEEN '2025-01-01' AND '2025-12-31'")),
    truth: num("SELECT -SUM(amount) v FROM transactions WHERE amount<0 AND category<>'transfer' AND date BETWEEN '2025-01-01' AND '2025-12-31'").toFixed(2),
  },
  {
    q: 'Are there any duplicate-looking transactions — the same vendor and amount appearing multiple times?',
    check: (a) => /yes|duplicate|recurring|multiple/i.test(a),
    truth: 'yes (recurring subscriptions)',
  },
  // --- flexible questions beyond the north-star set ---
  {
    q: 'How many customers do we have?',
    check: nearNumber(num('SELECT COUNT(*) v FROM customers'), 0, 0.5),
    truth: String(num('SELECT COUNT(*) v FROM customers')),
  },
  {
    q: 'What was our single largest expense transaction, and to which vendor?',
    check: all(nearNumber(Math.abs(biggest.amount)), mentions(biggest.vendor)),
    truth: `${biggest.vendor} ${Math.abs(biggest.amount).toFixed(2)}`,
  },
  {
    q: 'How much did we pay in payroll during 2025?',
    check: nearNumber(num("SELECT -SUM(amount) v FROM transactions WHERE category='payroll' AND date BETWEEN '2025-01-01' AND '2025-12-31'")),
    truth: num("SELECT -SUM(amount) v FROM transactions WHERE category='payroll' AND date BETWEEN '2025-01-01' AND '2025-12-31'").toFixed(2),
  },
];

if (!process.env.DEEPSEEK_API_KEY) {
  console.log('⚠  DEEPSEEK_API_KEY not set — skipping live eval. (Add it to .env to run.)');
  process.exit(0);
}

const agent = mastra.getAgentById('finance-agent');
let passed = 0;

for (const [i, c] of cases.entries()) {
  let answer = '';
  try {
    const res = await agent.generate(c.q, { maxSteps: 8 });
    answer = res.text ?? '';
  } catch (e) {
    answer = `ERROR: ${(e as Error).message}`;
  }
  const ok = c.check(answer);
  if (ok) passed++;
  console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'}  [${i + 1}/${cases.length}] ${c.q}`);
  console.log(`   expected ~ ${c.truth}`);
  console.log(`   agent: ${answer.replace(/\s+/g, ' ').trim().slice(0, 240)}`);
}

console.log(`\n──────────\nScore: ${passed}/${cases.length}`);
process.exit(passed === cases.length ? 0 : 1);
