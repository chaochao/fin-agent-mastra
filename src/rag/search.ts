// Inspect RAG retrieval from the terminal — see the top-K nearest chunks for a question.
// Usage:  npm run search -- "what are Contoso's payment terms?"
//         TOPK=6 npm run search -- "expense policy"     (override K, default 4)
import { openVectorStore, INDEX_NAME } from './vector-store.ts';
import { embed } from './embed.ts';

const question = process.argv.slice(2).join(' ').trim();
const topK = Number(process.env.TOPK ?? 4);

if (!question) {
  console.error('Usage: npm run search -- "your question"');
  process.exit(1);
}

const store = openVectorStore();
const hits = await store.query({
  indexName: INDEX_NAME,
  queryVector: await embed(question),
  topK,
});

console.log(`\nQ: ${question}   (top ${topK} of index "${INDEX_NAME}")\n`);
hits.forEach((h, i) => {
  const text = String(h.metadata?.text ?? '').replace(/\s+/g, ' ').slice(0, 160);
  console.log(`${i + 1}. score ${h.score.toFixed(3)}  [${h.metadata?.source}]`);
  console.log(`   ${text}\n`);
});
await store.close?.();
