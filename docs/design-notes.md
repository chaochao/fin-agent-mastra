# Design notes & improvement log

A running record of *why* things are built the way they are, and what we'd improve
later. Newest decisions at the top of each section. Keep entries short.

---

## Day 3 — `run_sql` tool (guarded text-to-SQL)

### What we built
The agent answers questions by **writing its own SQLite `SELECT`** and calling the
`run_sql` tool. We do **not** hand it a fixed set of filters — it generates the SQL.
Safety comes from rails, not from restricting the query shape.

- Tool: `src/mastra/tools/run-sql.ts` → `execute({ query })` where `query` is the
  LLM-generated SQL string.
- Rails: `src/db/safe-sql.ts` — read-only connection, single-`SELECT`-only (rejects
  `;`, comments, DDL/DML), auto-`LIMIT`. Returns rows on success or `{ ok:false, error }`.
- Retry loop: on error the model sees the error text and rewrites the SQL; capped via
  `maxSteps` (currently 8) in the `generate()` call.
- The model learns the tables from the **schema we inline in the agent's system prompt**
  (`src/mastra/agents/finance-agent.ts`), plus critical conventions (signed `amount`,
  exclude `transfer`, anchor date 2026-06-30).

### Why this shape
- Aggregating in SQL (not in the LLM's head) avoids number hallucination — the whole
  point in fintech.
- Rails contain the blast radius of raw LLM SQL: read-only physically blocks writes;
  single-SELECT + auto-LIMIT bound what can run.
- One flexible tool > several narrow tools (DRY, less for the model to choose between).

### Verification
- `npm test` — 25 deterministic tests (guard rejects DROP/DELETE/`;`/comments; all 6
  north-star questions run correctly through the rails). No API key needed.
- `npm run eval:day3` — live DeepSeek eval, 9/9 (6 north-star + 3 flexible). Needs
  `DEEPSEEK_API_KEY`. Compares agent answers to ground-truth SQL (numeric within 1%).

### Decisions made
- **Statement timeout:** skipped a true timeout. better-sqlite3 is synchronous and has
  no native query timeout; read-only + forced LIMIT bounds work on our ~500-row DB, so a
  timeout would be complexity for a risk that can't materialize (YAGNI). Revisit if the
  DB grows large or moves to a server engine.
- **Model:** switched to `deepseek/deepseek-v4-pro` (from `-flash`) for the agent.
- **Schema in prompt:** hardcoded (hand-written) for now — fine for 4 tables.

---

## Backlog / future improvements

Ranked-ish. Pull one into a day when it fits.

- [ ] **Auto-generate the schema block from the DB** (`sqlite_master` / `PRAGMA`) instead
  of hand-writing it in the prompt. Prevents prompt/DB drift after any `ALTER TABLE`.
  Small, high-value.
- [x] **"Spend" definition pinned to GROSS (2026-07-24).** In Studio the agent gave
  $4,396 vs the eval's $5,136 for Q2 software spend — because it sometimes dropped the
  `amount < 0` filter, letting positive **refund** rows net against charges. Root cause:
  "spend" was undefined (gross vs net of refunds). Decision: **gross money-out** — always
  filter `amount < 0`, report `-SUM(amount)`, never net out refunds unless asked. Pinned
  in the agent system prompt as an emphatic rule. Result: 5/5 runs now return $5,136.
  Note: prompt rules reduce but don't *guarantee* determinism — a hard guarantee needs a
  pinned query or an eval gate. The related 2025 operating-expenses ~$176 diff is the same
  family (refund netting) and should now track the gross definition too — re-check on next
  eval run.
- [ ] **Scale schema to the prompt — only matters for large DBs.** Our inline approach
  doesn't scale past dozens of tables (token cost, context limit, and — the real limit —
  accuracy degrades as relevant tables get lost in noise). Options when needed:
  1. Schema **RAG**: embed table/column descriptions, retrieve only the tables relevant
     to the question, inject just those. (This is the Day 4–5 RAG pattern, pointed at
     schema instead of documents.)
  2. Schema **introspection tools**: give the agent `listTables()` / `describeTable(name)`
     so it pulls schema on demand instead of receiving it all upfront.
  3. Combine: always send a compact table catalog (names + one-line purpose), retrieve/
     describe details on demand.
- [ ] **Prompt caching:** the system prompt (instructions + schema) is resent every call.
  It's static, so DeepSeek's context caching bills repeats at a discount — keep the
  stable schema/instructions at the front, variable user input last, and avoid churning
  the prompt text so cache hits stay warm.
- [ ] **Real statement timeout** (only if we outgrow SQLite/better-sqlite3): run queries
  in a worker thread we can kill after N ms, or move to an engine with native timeouts.
- [ ] **Result-size guardrail beyond LIMIT:** consider a max-columns / max-cell-size cap
  if we ever return wide rows to the model.
