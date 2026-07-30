# CLAUDE.md — project context

Read this first. It's the persistent memory for this project.

## What this is
`fin-agent-mastra` — an educational 10-day project to learn how to build a fintech
AI agent end-to-end with **Mastra**. Goal: prep for a founding-engineer role that
requires shipping production AI agents (tool-calling, memory, retrieval, guardrails,
evals) over structured financial data + documents.

Full plan and daily steps: `docs/10-day-plan.md`.

## Architecture / key decisions
- **Runtime:** Node.js 22.18+ with **npm** (not Bun — Bun optional on Day 10). Node runs `.ts` directly.
- **Agent / generator model:** **DeepSeek** — `deepseek/deepseek-v4-flash` in dev, `deepseek/deepseek-v4-pro` for final/eval. Needs `DEEPSEEK_API_KEY`.
- **Embeddings / retriever:** **NOT DeepSeek** (it has no embeddings API). Use **BGE-M3 via Ollama** (local, free, 1024 dims) — or `google/gemini-embedding-001` (cloud). This "embedder retrieves, DeepSeek generates" split is the standard DeepSeek RAG pattern.
- **Data:** SQLite (`better-sqlite3` or `@mastra/libsql`) for structured data → Postgres later. Vector store: LibSQL/pgvector local → Pinecone/Qdrant optional.
- **Model = a string** per agent in Mastra; use a general reasoning model, not a code-specialized one (the agent reasons + calls tools, it doesn't write code).
- Embedding dimension MUST match the vector index dimension (BGE-M3 = 1024). #1 RAG bug.

## Layout
```
src/mastra/index.ts            # entry point (registers agents)
src/mastra/agents/             # agent definitions (finance-agent.ts)
src/mastra/tools/              # createTool() tools (echo-tool.ts now)
data/                          # SQLite db + seed data (Day 2)
docs/10-day-plan.md            # the full plan
run.mjs                        # smoke test (npm run start)
```

## Commands
- `npm install` — install deps
- `cp .env.example .env` then add `DEEPSEEK_API_KEY`
- `npm run start` — smoke test (agent + echo tool via run.mjs)
- `npm run dev` — Mastra Studio UI at http://localhost:4111 (dev-only; not shipped to prod)

## Progress
- [x] **Day 1** — scaffold + DeepSeek agent + first `createTool()` tool + smoke test.
- [x] **Day 2** — seed realistic financial data into SQLite. `npm run seed` → `data/finance.db` (better-sqlite3, deterministic SEED=42, anchor 2026-06-30). Tables: accounts/customers/invoices/transactions (signed `amount` + `transaction_type`). `npm test` runs the `node --test` suites. Note: Node 22.17 needs `--experimental-strip-types` (baked into scripts).
- [x] **Day 3** — `run_sql` tool: **guarded text-to-SQL** (LLM writes the SQL; rails in `src/db/safe-sql.ts` enforce read-only + single-SELECT + auto-LIMIT; errors feed a retry loop capped by `maxSteps`). Schema inlined in the agent system prompt. Agent on `deepseek/deepseek-v4-pro`. `npm test` (25 deterministic) + `npm run eval:day3` (9/9 live). See `docs/design-notes.md` for rationale + backlog. (Chose this over the plan's narrower schema-constrained tool.)
- [x] **Day 4** — RAG ingest pipeline. `npm run ingest` → `data/vectors.db` (LibSQL vector store, `finance_docs` index, 1024-dim). Loads `data/docs/*.md` → chunk (`MDocument`, recursive, maxSize 512/overlap 50) → embed (BGE-M3 via local Ollama, `src/rag/embed.ts`) → upsert with chunk text in metadata. Retrieval verified (right doc + section per question). Pinned `@mastra/libsql@1.16.0` for core 1.51 compat. See `docs/design-notes.md`.
- [ ] **Day 5** — `searchDocuments` RAG tool + wire into agent.
- [ ] **Day 6** — memory. **Day 7** — guardrails/validation. **Day 8** — evals.
- [ ] **Day 9** — a Workflow (multi-step orchestration). **Day 10** — harden (Postgres/pgvector) + write-up.

## Notes for the assistant
- User is on npm, new to vectorization — teach it hands-on when Day 4 arrives.
- Keep responses concise. User prefers minimal preamble.
- Do folder renames in Finder, not from the sandbox (it detaches the mount).
