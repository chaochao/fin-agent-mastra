// Live eval — document RAG (search_documents): does the agent route to the RAG tool, cite the source, ground its
// answers in retrieved text, and still handle SQL questions?
// Run: npm run eval:rag   (needs DEEPSEEK_API_KEY in .env + Ollama running with bge-m3)
import { mastra } from '../mastra/index.ts';

type Case = { q: string; expect: string; check: (a: string) => boolean };

const has = (a: string, ...subs: string[]) => {
  const l = a.toLowerCase();
  return subs.some((s) => l.includes(s.toLowerCase()));
};

// A source is "cited" whether the agent names the file or the document's title —
// both are valid citations. Exact-filename-only matching gives false negatives.
const citesMsa = (a: string) =>
  has(a, 'contoso-media-msa.md', 'contoso media master services agreement', 'contoso media msa', 'contoso msa');
const citesPolicy = (a: string) =>
  has(a, 'travel-and-expense-policy.md', 'travel & expense policy', 'travel and expense policy');

const cases: Case[] = [
  {
    q: 'What are our payment terms with Contoso?',
    expect: 'net-30, cites contoso-media-msa.md',
    check: (a) => citesMsa(a) && has(a, 'net-30', '30 day', 'thirty'),
  },
  {
    q: 'Can I expense alcohol on a business trip?',
    expect: 'no (except client events), cites travel-and-expense-policy.md',
    check: (a) => citesPolicy(a) && has(a, 'client', 'not reimbursable', 'except'),
  },
  {
    q: 'What is the late-payment penalty in the Contoso contract?',
    expect: '1.5% per month, cites the MSA',
    check: (a) => citesMsa(a) && has(a, '1.5', 'one and one-half'),
  },
  {
    q: 'What did we spend on software subscriptions in Q2 2026?',
    expect: 'routes to run_sql -> $5,136',
    check: (a) => /5[,]?136/.test(a),
  },
  {
    q: "What are AWS's payment terms?",
    expect: 'declines — no document on AWS (no hallucinated terms)',
    check: (a) => has(a, "don't have", 'do not have', 'no document', 'no contract', "couldn't find", 'not have', 'no information', "don't have a document"),
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
  console.log(`   expect: ${c.expect}`);
  console.log(`   agent:  ${answer.replace(/\s+/g, ' ').trim().slice(0, 240)}`);
}

console.log(`\n──────────\nScore: ${passed}/${cases.length}`);
process.exit(passed === cases.length ? 0 : 1);
