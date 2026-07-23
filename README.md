# fin-agent-mastra — SMB Finance Copilot

A 10-day educational project: build an end-to-end AI agent over structured financial
data + documents with **Mastra + DeepSeek** (agent) and **BGE-M3** (embeddings/RAG).

Full plan: [`docs/10-day-plan.md`](docs/10-day-plan.md)

## Architecture (why two models)
- **Generator / agent:** DeepSeek (`deepseek/deepseek-v4-flash` in dev, `-pro` for final).
- **Embeddings / retriever:** BGE-M3 via Ollama (DeepSeek has no embeddings API).

## Setup
```bash
npm install
cp .env.example .env      # then paste your DEEPSEEK_API_KEY
```

## Run
```bash
npm run start   # smoke test: agent says hello + calls the echo tool (run.mjs)
npm run dev     # opens Mastra Studio, an interactive UI for the agent
```
Requires Node.js 22.18+ (runs `.ts` files directly, no build step).

## Where things live
```
src/mastra/index.ts            # Mastra entry point (registers agents)
src/mastra/agents/             # agent definitions
src/mastra/tools/              # createTool() tools (echo now; queryTransactions on Day 3)
data/                          # SQLite db + seed data (Day 2)
docs/10-day-plan.md            # the full plan
```

## Status
- [x] Day 1 — scaffold + agent + first tool (this)
- [ ] Day 2 — seed financial data
- [ ] Day 3 — structured query tool
- [ ] Day 4 — vectorize documents (BGE-M3)
- [ ] Day 5+ — RAG tool, memory, guardrails, evals, workflow
