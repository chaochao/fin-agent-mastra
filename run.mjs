// Quick smoke test — run with: node run.mjs
// Requires DEEPSEEK_API_KEY in your .env (Node 22.18+ auto-loads .env).
import { mastra } from './src/mastra/index.ts';

const agent = mastra.getAgentById('finance-agent');
const res = await agent.generate('Say hello, then use the echo tool to echo "it works".');
console.log(res.text);
