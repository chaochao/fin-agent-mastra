// Day 5 tool: RAG retrieval. Embed the question, find the nearest document chunks,
// return their text + source so the agent can answer from documents and cite them.
// Reuses the same embed() and vector store as the ingest pipeline (Day 4).
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { embed } from '../../rag/embed.ts';
import { openVectorStore, INDEX_NAME } from '../../rag/vector-store.ts';

const TOP_K = 4;
// Loose floor: only filters out "nothing even vaguely related". Fine-grained relevance
// is judged by the agent reading the returned text (scores are poorly calibrated).
const MIN_SCORE = 0.3;

export const searchDocumentsTool = createTool({
  id: 'search_documents',
  description:
    "Search the company's documents (contracts, policies) by meaning and get back the most " +
    'relevant passages with their source file. Use for questions about contract clauses, ' +
    'payment terms, service levels, and expense/travel policy — NOT for numeric questions about ' +
    'transactions or invoices (use run_sql for those). Answer only from the returned text.',
  inputSchema: z.object({
    question: z.string().describe('The natural-language question to search documents for.'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    results: z.array(z.object({ text: z.string(), source: z.string() })),
  }),
  execute: async ({ question }) => {
    const store = openVectorStore();
    try {
      const hits = await store.query({
        indexName: INDEX_NAME,
        queryVector: await embed(question),
        topK: TOP_K,
      });
      const relevant = hits.filter((h) => h.score >= MIN_SCORE);
      return {
        found: relevant.length > 0,
        results: relevant.map((h) => ({
          text: String(h.metadata?.text ?? ''),
          source: String(h.metadata?.source ?? 'unknown'),
        })),
      };
    } finally {
      await store.close?.();
    }
  },
});
