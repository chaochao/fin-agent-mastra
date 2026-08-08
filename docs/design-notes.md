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

## Day 6 — Memory (history + working memory)

### What we built
- `src/mastra/index.ts` — `LibSQLStore` on the **Mastra instance** (not on Memory) →
  `data/memory.db`. Third store: finance.db (numbers), vectors.db (docs), memory.db (state).
- `finance-agent.ts` — `new Memory({ options: { lastMessages: 20, workingMemory: {
  enabled, scope:'resource', template } } })`, plus a "## Memory" prompt section telling it
  to resolve follow-ups from history and update working memory for durable facts only.
- Working-memory template seeded with facts that used to be hardcoded in the prompt
  (currency, fiscal year, anchor date, gross-spend basis) — the agent can revise them.
- `src/evals/memory.ts` (`npm run eval:memory`) — 5/5. Two threads, one resource: proves
  follow-ups work *within* a thread, working memory *crosses* threads, history does not.

### API drift caught (why the skill was worth installing)
- Call signature is `agent.generate(p, { memory: { resource, thread } })` — **not**
  top-level `{ resourceId, threadId }`, which is what internal knowledge suggested.
- Storage attaches to the `Mastra` instance: `new Mastra({ storage: new LibSQLStore({ id, url }) })`.
- `@mastra/memory@1.26.0` imports fine with core 1.51 (no pin needed, unlike libsql).

### The template bug (worth remembering)
First run scored 4/5: "history leaked" into a new thread. It hadn't — my template had a
field `**Open topics / what we last discussed**:`, so the agent dutifully wrote conversation
summaries into *resource-scoped* working memory, which then crossed threads by design.
That field also contradicted the prompt rule "lasting facts only". Removing the one line
fixed it → 5/5.
**Lesson: the template's field labels ARE the instruction.** The model decides what to store
from (1) template fields, (2) current contents, (3) instructions — there is no "remember"
keyword. To control what's remembered, edit the template fields.

### What actually triggers a working-memory write (measured, 2026-08-08)
There is **no trigger keyword**. The model decides per call whether something is "durable",
influenced by (1) an explicit cue, (2) how durable the content really is, (3) an empty
labeled template field. We ran one statement per fresh resourceId and read back
`mastra_resources`:

| Case | Statement | Stored? |
|---|---|---|
| A | "**Remember that** I am based in Seattle." | ✅ into `**User**` |
| B | "I am based in Seattle." (same fact, no cue) | ❌ |
| C | "I prefer short, one-line answers." | ❌ (despite a `**Preferences**` field existing) |
| D | "What did we spend on software in Q2 2026?" | ❌ correct — transient |
| E | "**Remember that** Q2 spend was $5,136." | ❌ correct — refused a one-off metric |
| F | "I'm working on the board deck today." | ❌ correct — temporary |

- **A vs B is a controlled pair** — same fact, only the word "Remember" differs, and only A
  stored. The explicit cue is the strongest single signal.
- **E shows the cue alone is not sufficient** — "remember" + a one-off number was correctly
  refused, because the instructions say lasting facts only. Cue AND durability are needed.
- **It is NOT deterministic.** In a separate run, "My birthday is January 1st. Also I prefer
  figures rounded to whole dollars" stored BOTH with no cue at all — and even invented a new
  `**User's birthday**` field not present in the template. That directly contradicts case C.
  Same class of statement, opposite outcome, run to run.

**Takeaways.** Off-template facts *can* be stored (Markdown is free-form), but improvised
fields are discretionary and, under replace semantics, can be silently dropped on a later
rewrite. So: if losing it would matter, give it a template field — the template is not a
limit on what *can* be stored, it is a guarantee about what *will* be. And do not trust
model judgment for anything that matters: tighten the instruction, prefer the Zod schema
(merge semantics) for must-have fields, and assert on `mastra_resources` in a test.
This is a Day 7 (guardrails) theme: "usually does the right thing" is not a guarantee.

### Decisions made
- **Markdown template, not Zod schema.** Templates use *replace* semantics (agent rewrites
  the whole block, so a sloppy update can drop fields); schemas use *merge* semantics and
  are type-safe. Markdown is simpler and fine at our size — revisit if fields get dropped.
- **Evals renamed** from `day3/day5/day6` to `sql-queries` / `document-rag` / `memory`
  (`eval:sql`, `eval:rag`, `eval:memory`) — names should say what they test, not when written.
- Also gitignore `data/*.db-shm` / `*.db-wal` (LibSQL runs in WAL mode).

---

## Day 5 — `search_documents` RAG tool (wire RAG into the agent)

### What we built
- `src/mastra/tools/search-documents.ts` — `createTool` that embeds the question,
  runs `store.query({ topK:4 })`, filters by a **loose 0.3 score floor**, and returns
  `{ found, results:[{ text, source }] }`. Reuses Day 4's `embed()` + `openVectorStore()`.
- `finance-agent.ts` — added the tool + rewrote the prompt to **route** (numbers→run_sql,
  documents→search_documents, some questions need both), **ground** answers only in
  returned text, **cite** the source file, and **decline** when nothing matches.
- `src/evals/day5.ts` (`npm run eval:day5`) — live checks: routing, citation, grounding,
  and an out-of-scope question that must be declined. 5/5 on pro.

### Decisions made
- **No scores exposed to the LLM.** Cosine scores live in a compressed, model-specific
  band and LLMs can't calibrate them → the model judges relevance from the returned TEXT.
  Scores used internally only, for the loose floor.
- **Loose floor (0.3), not a tight threshold.** A hard cutoff is fragile (compressed band);
  0.3 only catches "nothing even vaguely related", and the grounding prompt does the rest.
- **`{ found }` flag + strict grounding prompt** = the real anti-hallucination lever
  (verified: agent declines "AWS payment terms" instead of inventing).
- **Model kept on `deepseek-v4-pro`.** A/B via the eval: flash ALSO scored 5/5 and is
  faster/cheaper, but our cases are easy; pro chosen for the harder cross-plane reasoning
  on Day 6/9. Re-check with evals — let the eval pick the model. (Note: `deepseek-v4-flash-0731`
  is NOT a valid API model name — only `deepseek-v4-pro` / `deepseek-v4-flash`.)

---

## Day 4 — RAG ingest pipeline (chunk → embed → store)

### What we built
`npm run ingest` turns `data/docs/*.md` into a queryable vector index:
- `src/rag/embed.ts` — embeddings via **BGE-M3 on local Ollama** (`/api/embeddings`),
  1024 dims. DeepSeek has no embeddings API, so this is the "embedder" half of the split.
- `src/rag/vector-store.ts` — **LibSQL** vector store at `data/vectors.db`, index
  `finance_docs`, cosine, 1024-dim. Path resolved via shared `findProjectRoot()`.
- `src/rag/ingest.ts` — load → `MDocument.chunk({ strategy:'recursive', maxSize:512,
  overlap:50 })` → embed → `upsert` with the chunk **text stored in metadata** (so
  retrieval returns real text, not just a vector). Rebuilds the index each run.
- Sample corpus: `data/docs/contoso-media-msa.md` (net-30 contract) + `travel-and-expense-policy.md`.

### Verification
Retrieval routes each question to the right doc AND section: "payment terms for Contoso"
→ MSA; "expense alcohol" → policy §4 Meals; "pay invoice late" → MSA §2 Late payments.

### Decisions made
- **Embedding call = direct Ollama fetch**, not Mastra's `embedMany`/model-router. Simpler,
  transparent, one fewer API to track, and already proven in the demo.
- **`@mastra/libsql` pinned to 1.16.0.** `latest` (1.18) imports `FactoryStorage` from
  `@mastra/core/storage`, which our core 1.51 doesn't export → `Class extends undefined`.
  1.16.0 is the newest that imports cleanly with core 1.51. (Upgrading the whole Mastra
  stack to latest is deferred — it risks the working Day 1–3 agent; revisit on Day 10.)
- **Two separate stores:** `finance.db` (structured) vs `data/vectors.db` (documents).
  Re-seeding one never touches the other; re-embed only when the *documents* change.
- **Doc drift caught:** the plan's `chunk({ size })` is now `maxSize`, and `LibSQLVector`
  takes `{ id, url }` (not `connectionUrl`). Verified via a live probe before writing.

---

## Backlog / future improvements

Ranked-ish. Pull one into a day when it fits.

- [ ] **Make working-memory writes reliable** (from the 2026-08-08 measurements above).
  Today a stated preference/location is stored only sometimes. Options, cheapest first:
  (a) tighten the instruction — "ALWAYS record any stated user preference, location, or
  personal detail"; (b) add explicit template fields for what must persist; (c) switch
  `workingMemory` from `template` to `schema` (Zod) for merge semantics + type safety.
  Verify by re-running the A–F statement matrix and asserting on `mastra_resources`.
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
