// Day 4 ingest pipeline: turn data/docs/*.{md,txt} into a queryable vector index.
// Steps: load -> chunk (recursive, boundary-aware) -> embed (BGE-M3) -> upsert with
// the chunk text in metadata (so retrieval can hand real text back to the LLM).
// Run: npm run ingest  (rebuilds data/vectors.db from scratch each time).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MDocument } from '@mastra/rag';
import { findProjectRoot } from '../db/index.ts';
import { embedMany } from './embed.ts';
import { openVectorStore, INDEX_NAME, VECTOR_DIM } from './vector-store.ts';

const DOCS_DIR = join(findProjectRoot(), 'data', 'docs');

async function main() {
  const store = openVectorStore();

  // Fresh rebuild: drop the index if it exists, then recreate at the right dimension.
  try {
    await store.deleteIndex({ indexName: INDEX_NAME });
  } catch {
    // index didn't exist yet — fine on first run
  }
  await store.createIndex({ indexName: INDEX_NAME, dimension: VECTOR_DIM, metric: 'cosine' });

  const files = readdirSync(DOCS_DIR).filter((f) => /\.(md|txt)$/.test(f));
  if (files.length === 0) {
    throw new Error(`No .md/.txt documents found in ${DOCS_DIR}`);
  }

  let total = 0;
  for (const file of files) {
    const text = readFileSync(join(DOCS_DIR, file), 'utf8');
    const doc = MDocument.fromText(text);
    const chunks = await doc.chunk({ strategy: 'recursive', maxSize: 512, overlap: 50 });
    const vectors = await embedMany(chunks.map((c) => c.text));
    await store.upsert({
      indexName: INDEX_NAME,
      vectors,
      metadata: chunks.map((c) => ({ text: c.text, source: file })),
    });
    console.log(`  ${file}: ${chunks.length} chunks embedded`);
    total += chunks.length;
  }

  console.log(`\nIngested ${total} chunks from ${files.length} document(s) into "${INDEX_NAME}".`);
  await store.close?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
