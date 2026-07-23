# Day 2 — Seed realistic SaaS finance data (design)

**Date:** 2026-07-23
**Deliverable:** `seed.ts` + a populated `data/finance.db` (SQLite), plus a north-star
question set that becomes the Day 8 eval baseline.

## Goal

Generate fake-but-realistic financial data for a small B2B **SaaS startup** ("we"),
loaded into SQLite via **better-sqlite3**. The data must be **deterministic** — the
same `finance.db` every run — so Day 8 eval expected-answers stay stable.

## Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| SQLite driver | `better-sqlite3` | Synchronous, simplest for a seed script + Day 3 parameterized queries. Postgres migration is Day 10. |
| Business persona | B2B SaaS startup | Rich category mix; matches the plan's "software subscriptions last quarter" example. |
| Determinism | Seeded PRNG (`mulberry32`), no external dep | Identical DB every run → stable evals. |
| Amount modeling | Signed `amount` (− out / + in) **plus** a `transaction_type` column | Signed matches real ledger exports; `transaction_type` is production-faithful, indexes/sorts well, and is NOT derivable from sign once refunds exist. |
| Date anchoring | Fixed anchor **2026-06-30**, data spans **Jan 2025 → Jun 2026** | "last quarter / last year / H1" questions all have data, independent of wall-clock. |

### Why both `amount` sign AND `transaction_type`

They carry different information and are complementary:
- `amount` = magnitude + direction of the cash movement.
- `transaction_type` = *what kind* of movement (`charge`/`payment`/`refund`/`transfer`/`fee`/`payout`).

A `refund` is money **in** on an **expense** category, so sign alone cannot classify it —
the column is genuinely non-redundant. The Day 3 `queryTransactions` tool will expose a
clean `type` filter that maps to this column, keeping the LLM away from sign conventions.

## Schema

Anchor: `ANCHOR_DATE = 2026-06-30`. All dates generated relative to this constant.

### `accounts` (~3 rows)
| col | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | e.g. "Operating Checking", "Savings", "Amex Corporate" |
| type | TEXT | CHECK in ('checking','savings','credit_card') |
| currency | TEXT | 'USD' |

### `customers` (10 rows)
| col | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | fictional B2B company names |
| email | TEXT | billing contact |
| payment_terms | TEXT | CHECK in ('net_15','net_30','net_60') |

### `invoices` (~50 rows) — accounts receivable (we bill customers)
| col | type | notes |
|---|---|---|
| id | INTEGER PK | |
| customer_id | INTEGER FK → customers.id | |
| invoice_number | TEXT | e.g. "INV-2026-0042" |
| issue_date | TEXT (ISO date) | |
| due_date | TEXT | issue_date + payment_terms |
| amount | REAL | always positive |
| status | TEXT | CHECK in ('paid','open','overdue') |
| paid_date | TEXT NULL | set when status='paid' |

`status` is computed against the anchor date: paid → has `paid_date`; open → due_date ≥ anchor;
overdue → due_date < anchor and unpaid. A subset (~8) are deliberately overdue for question #4.

### `transactions` (~500 rows) — the core ledger
| col | type | notes |
|---|---|---|
| id | INTEGER PK | |
| account_id | INTEGER FK → accounts.id | |
| date | TEXT (ISO date) | within Jan 2025 – Jun 2026 |
| amount | REAL | signed: − = money out, + = money in |
| transaction_type | TEXT | CHECK in ('charge','payment','refund','transfer','fee','payout') |
| category | TEXT | see category list below |
| vendor | TEXT NULL | vendor name for expenses; NULL for customer payments/transfers |
| description | TEXT | human-readable memo |
| invoice_id | INTEGER NULL FK → invoices.id | set for `payment` rows (revenue ↔ invoice) |

Indexes: on `date`, `category`, `transaction_type`, `vendor` (support Day 3 filters).

## Categories & vendors

**Expense categories:** software_subscriptions, cloud_infrastructure, payroll,
contractors, marketing, travel, office, professional_services, taxes,
payment_processing, bank_fees, transfer.
**Income category:** revenue.

**Software vendors:** AWS, GCP, Figma, Notion, Slack, GitHub, Linear, Vercel, Datadog, HubSpot.
**Other vendors:** Gusto (payroll), a few contractor names, WeWork (office), Google Ads (marketing), Stripe (payment_processing).

## Row-generation plan (~500 transactions)

Deterministic via `mulberry32(SEED)`. Generation order matters: **invoices are generated
first**, then `payment` transactions are created one-per-*paid*-invoice (so counts can't
contradict). The rest fill out to ~500:
- **payment** (= # of paid invoices, ~35 rows) — customer invoice payments (positive);
  each links 1:1 to a `paid` invoice via `invoice_id`, amount = invoice amount, date = `paid_date`.
- **charge** (~60%) — vendor expenses across categories; monthly-recurring software subs + ad-hoc.
- **payout** (~13%) — payroll + contractors, recurring monthly, larger amounts.
- **fee** (~16%) — small Stripe/bank fees, frequent.
- **refund** (~6 rows) — positive, on an expense category (e.g. cancelled SaaS seat).
- **transfer** (~5 rows) — checking ↔ savings; category='transfer'; excluded from P&L.

Percentages apply to the remaining ~465 non-payment rows; totals are approximate and the
generator just needs to land near ~500 transactions.

Recurring subscriptions repeat monthly with the *same* vendor+amount → also seeds
realistic input for question #6 (duplicate detection) and Day 5/9 reasoning.

## File layout

```
src/db/schema.sql     # DDL for the 4 tables + indexes
src/db/index.ts        # opens & exports the better-sqlite3 connection (reused by Day 3 tool)
src/db/seed.ts         # deterministic generator + loader → writes data/finance.db
data/finance.db        # generated output (gitignored)
docs/north-star-questions.md   # the 6 questions
```

`package.json`: add `"seed": "node src/db/seed.ts"`. `seed.ts` drops & recreates tables
each run (idempotent rebuild). `data/finance.db` stays gitignored.

## North-star questions (Day 8 eval set)

1. What did we spend on software subscriptions in Q2 2026? *(category + date range)*
2. Which vendor did we pay the most last quarter? *(GROUP BY vendor)*
3. How much revenue did we collect in H1 2026? *(income sum)*
4. Which invoices are currently overdue, and what's the total outstanding? *(invoice status)*
5. What were our total operating expenses in 2025? *(full-year sum; exclude transfers)*
6. Any duplicate-looking transactions — same vendor + amount within a few days? *(cross-row reasoning; Day 5/9)*

## Success criteria / verification

- `npm run seed` runs clean and (re)creates `data/finance.db`.
- Row counts: `accounts`=3, `customers`=10, `invoices`≈50, `transactions`≈500.
- Running the seed twice yields byte-identical row data (determinism check).
- Each of the 6 questions is answerable from the data with a hand-written SQL query
  returning a sensible number (sanity check before Day 3 automates it).
- `data/finance.db` is NOT committed; `src/db/*` and `docs/north-star-questions.md` are.

## Out of scope (YAGNI for Day 2)

- No double-entry / debit-credit ledger.
- No multi-currency (USD only).
- No ORM — raw SQL via better-sqlite3.
- The Day 3 `queryTransactions` tool (next day).
