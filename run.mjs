// Quick smoke test — run with: node run.mjs
// Requires DEEPSEEK_API_KEY in your .env (Node 22.18+ auto-loads .env).
import { mastra } from './src/mastra/index.ts';

const agent = mastra.getAgentById('finance-agent');
const res = await agent.generate(
  'What did we spend on software subscriptions in Q2 2026?',
  { maxSteps: 8 },
);
console.log(res.text);
