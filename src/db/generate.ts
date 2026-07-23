import { type Rng } from './rng.ts';

export const SEED = 42;
export const ANCHOR = '2026-06-30';
export const START = '2025-01-01';

export type Account = { id: number; name: string; type: 'checking' | 'savings' | 'credit_card'; currency: 'USD' };
export type Customer = { id: number; name: string; email: string; payment_terms: 'net_15' | 'net_30' | 'net_60' };
export type Invoice = {
  id: number; customer_id: number; invoice_number: string;
  issue_date: string; due_date: string; amount: number;
  status: 'paid' | 'open' | 'overdue'; paid_date: string | null;
};
export type Transaction = {
  account_id: number; date: string; amount: number;
  transaction_type: 'charge' | 'payment' | 'refund' | 'transfer' | 'fee' | 'payout';
  category: string; vendor: string | null; description: string; invoice_id: number | null;
};

// ---- date helpers (UTC, ISO yyyy-mm-dd) ----
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime();
  return Math.round(ms / 86400000);
}

// ---- accounts ----
export function generateAccounts(): Account[] {
  return [
    { id: 1, name: 'Operating Checking', type: 'checking', currency: 'USD' },
    { id: 2, name: 'Business Savings', type: 'savings', currency: 'USD' },
    { id: 3, name: 'Amex Corporate', type: 'credit_card', currency: 'USD' },
  ];
}

// ---- customers ----
const CUSTOMER_NAMES = [
  'Northwind Retail', 'Contoso Media', 'Fabrikam Logistics', 'Adventure Works',
  'Tailspin Toys', 'Wingtip Software', 'Proseware Health', 'Litware Finance',
  'Alpine Ski House', 'Coho Winery',
] as const;
const TERMS = ['net_15', 'net_30', 'net_60'] as const;

export function generateCustomers(rng: Rng): Customer[] {
  return CUSTOMER_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    email: `ap@${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
    payment_terms: rng.pick(TERMS),
  }));
}

// ---- invoices ----
const TERM_DAYS: Record<Customer['payment_terms'], number> = { net_15: 15, net_30: 30, net_60: 60 };

export function generateInvoices(rng: Rng, customers: Customer[]): Invoice[] {
  const total = daysBetween(START, ANCHOR);
  const invoices: Invoice[] = [];
  for (let i = 0; i < 50; i++) {
    const cust = rng.pick(customers);
    const issue = addDays(START, rng.randInt(0, total));
    const due = addDays(issue, TERM_DAYS[cust.payment_terms]);
    const amount = Math.round(rng.randFloat(800, 24000) * 100) / 100;
    let status: Invoice['status'];
    let paid_date: string | null = null;
    // Payment must land on/before the anchor to count as paid as-of that date.
    const willPay = rng.chance(0.75);
    const paidCandidate = addDays(issue, rng.randInt(3, TERM_DAYS[cust.payment_terms] + 5));
    if (willPay && paidCandidate <= ANCHOR) {
      status = 'paid';
      paid_date = paidCandidate;
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

// ---- transactions ----
const SOFTWARE_VENDORS = ['Figma', 'Notion', 'Slack', 'GitHub', 'Linear', 'Vercel', 'Datadog', 'HubSpot'] as const;
const CLOUD_VENDORS = ['AWS', 'GCP'] as const;
const CONTRACTORS = ['J. Rivera (design)', 'P. Okafor (backend)', 'M. Chen (content)'] as const;
const MISC_CHARGES = [
  { category: 'office', vendor: 'Amazon Business', desc: 'Office supplies', lo: 40, hi: 600 },
  { category: 'software_subscriptions', vendor: 'Zoom', desc: 'Zoom add-on seats', lo: 15, hi: 200 },
  { category: 'travel', vendor: 'United Airlines', desc: 'Business flight', lo: 200, hi: 1400 },
  { category: 'marketing', vendor: 'LinkedIn Ads', desc: 'Sponsored posts', lo: 200, hi: 2500 },
  { category: 'professional_services', vendor: 'Deloitte', desc: 'Accounting services', lo: 300, hi: 2000 },
] as const;

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

  // Fixed monthly recurring price per software vendor (same every month → feeds Q6 duplicate detection).
  const softwarePrice: Record<string, number> = {};
  for (const v of SOFTWARE_VENDORS) softwarePrice[v] = rng.randInt(20, 400);
  const cloudBase: Record<string, number> = {};
  for (const v of CLOUD_VENDORS) cloudBase[v] = rng.randInt(1500, 6000);

  for (const first of months) {
    const day = (n: number) => addDays(first, n);

    for (const v of SOFTWARE_VENDORS) {
      txs.push({ account_id: card.id, date: day(rng.randInt(0, 5)), amount: -softwarePrice[v],
        transaction_type: 'charge', category: 'software_subscriptions', vendor: v,
        description: `${v} monthly subscription`, invoice_id: null });
    }
    for (const v of CLOUD_VENDORS) {
      const amt = Math.round(cloudBase[v] * rng.randFloat(0.8, 1.3) * 100) / 100;
      txs.push({ account_id: card.id, date: day(rng.randInt(1, 6)), amount: -amt,
        transaction_type: 'charge', category: 'cloud_infrastructure', vendor: v,
        description: `${v} cloud usage`, invoice_id: null });
    }
    for (const d of [1, 15]) {
      txs.push({ account_id: checking.id, date: day(d), amount: -rng.randInt(28000, 42000),
        transaction_type: 'payout', category: 'payroll', vendor: 'Gusto',
        description: 'Payroll run', invoice_id: null });
    }
    for (const c of CONTRACTORS) {
      if (rng.chance(0.66)) {
        txs.push({ account_id: checking.id, date: day(rng.randInt(5, 25)), amount: -rng.randInt(1500, 7000),
          transaction_type: 'payout', category: 'contractors', vendor: c,
          description: `Contractor payment — ${c}`, invoice_id: null });
      }
    }
    txs.push({ account_id: card.id, date: day(rng.randInt(2, 20)), amount: -rng.randInt(500, 5000),
      transaction_type: 'charge', category: 'marketing', vendor: 'Google Ads',
      description: 'Ad spend', invoice_id: null });
    txs.push({ account_id: checking.id, date: day(rng.randInt(1, 3)), amount: -rng.randInt(1800, 2600),
      transaction_type: 'charge', category: 'office', vendor: 'WeWork',
      description: 'Office membership', invoice_id: null });
    txs.push({ account_id: checking.id, date: day(rng.randInt(1, 28)), amount: -rng.randInt(15, 60),
      transaction_type: 'fee', category: 'bank_fees', vendor: null,
      description: 'Monthly account fee', invoice_id: null });
    if (rng.chance(0.5)) {
      txs.push({ account_id: card.id, date: day(rng.randInt(3, 27)), amount: -rng.randInt(300, 3500),
        transaction_type: 'charge', category: 'travel', vendor: 'Concur',
        description: 'Business travel', invoice_id: null });
    }
    if (rng.chance(0.4)) {
      txs.push({ account_id: checking.id, date: day(rng.randInt(3, 27)), amount: -rng.randInt(500, 6000),
        transaction_type: 'charge', category: 'professional_services', vendor: 'Baker & Co (legal)',
        description: 'Legal/advisory', invoice_id: null });
    }
    // a few miscellaneous ad-hoc charges to round the month out to a realistic volume
    const nMisc = rng.randInt(3, 6);
    for (let k = 0; k < nMisc; k++) {
      const m = rng.pick(MISC_CHARGES);
      txs.push({ account_id: card.id, date: day(rng.randInt(2, 27)), amount: -rng.randInt(m.lo, m.hi),
        transaction_type: 'charge', category: m.category, vendor: m.vendor,
        description: m.desc, invoice_id: null });
    }
  }

  // quarterly estimated taxes
  for (const d of ['2025-04-15', '2025-06-15', '2025-09-15', '2026-01-15', '2026-04-15']) {
    txs.push({ account_id: checking.id, date: d, amount: -rng.randInt(9000, 20000),
      transaction_type: 'charge', category: 'taxes', vendor: 'IRS',
      description: 'Estimated quarterly tax', invoice_id: null });
  }

  // payments: exactly one per paid invoice (income) + a Stripe processing fee
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

  // transfers: 5 checking -> savings (internal, excluded from P&L)
  for (let i = 0; i < 5; i++) {
    txs.push({ account_id: savings.id, date: addDays(START, rng.randInt(60, daysBetween(START, ANCHOR))),
      amount: rng.randInt(10000, 40000), transaction_type: 'transfer', category: 'transfer',
      vendor: null, description: 'Transfer from checking to savings', invoice_id: null });
  }

  return rng.shuffle(txs);
}
