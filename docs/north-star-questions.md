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
