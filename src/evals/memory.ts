// Live eval — memory. Two things a one-shot eval can't test:
//   1. conversation history (thread-scoped) — follow-ups resolve without restating
//   2. working memory (resource-scoped) — durable facts survive into a NEW thread,
//      while that thread correctly has NO history from the old one.
// Run: npm run eval:memory   (needs DEEPSEEK_API_KEY + Ollama running with bge-m3)
import { mastra } from '../mastra/index.ts';

const agent = mastra.getAgentById('finance-agent');
const RESOURCE = 'eval-user-chao';
const threadA = `day6-thread-a-${Date.now()}`;
const threadB = `day6-thread-b-${Date.now()}`;

const has = (a: string, ...subs: string[]) => {
  const l = a.toLowerCase();
  return subs.some((s) => l.includes(s.toLowerCase()));
};

async function ask(prompt: string, thread: string) {
  const res = await agent.generate(prompt, {
    memory: { resource: RESOURCE, thread },
    maxSteps: 8,
  });
  return res.text ?? '';
}

let pass = 0;
let total = 0;
const report = (name: string, ok: boolean, answer: string) => {
  total++;
  if (ok) pass++;
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  [${total}] ${name}`);
  console.log(`   agent: ${answer.replace(/\s+/g, ' ').slice(0, 200)}\n`);
};

// --- Thread A: conversation history ----------------------------------------
console.log(`\n── Thread A (history) ──\n`);

const a1 = await ask('What did we spend on software subscriptions in Q2 2026?', threadA);
report('baseline Q2 answer ($5,136)', /5[,]?136/.test(a1), a1);

// The whole point: "that" is only resolvable from history.
const a2 = await ask('And the quarter before that?', threadA);
report(
  'follow-up resolves to Q1 2026 without restating context',
  // must NOT ask for clarification, and should name Q1 / give a number
  !has(a2, 'which quarter', 'could you clarify', 'please specify') &&
    (has(a2, 'q1', 'january', 'first quarter') || /\$\s?[\d,]+/.test(a2)),
  a2,
);

// Teach it a durable fact — belongs in working memory, not history.
const a3 = await ask(
  'By the way, I am Chao, the founder. Please remember that.',
  threadA,
);
report('acknowledges the durable fact', has(a3, 'chao', 'founder', 'remember', 'noted'), a3);

// --- Thread B: fresh thread, same user -------------------------------------
console.log(`── Thread B (new thread, same resource) ──\n`);

// Working memory is resource-scoped -> should carry over.
const b1 = await ask('Who am I, and what currency do we report in?', threadB);
report(
  'working memory carried into the NEW thread (name + USD)',
  has(b1, 'chao') && has(b1, 'usd', 'dollar'),
  b1,
);

// History is thread-scoped -> should NOT carry over. Correct behavior is to ask,
// not to silently assume Q1/Q2 from the other conversation.
const b2 = await ask('And the quarter before that?', threadB);
report(
  'history did NOT leak: asks for context instead of assuming',
  has(b2, 'which', 'clarify', 'specify', "don't have", 'not sure', 'what period', 'context'),
  b2,
);

console.log('──────────');
console.log(`Score: ${pass}/${total}`);
if (pass < total) process.exitCode = 1;
