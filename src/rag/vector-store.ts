// The document vector store: LibSQL (SQLite-based), local file at data/vectors.db.
// Separate from finance.db — this holds embedded document chunks, not transactions.
import { LibSQLVector } from '@mastra/libsql';
import { join } from 'node:path';
import { findProjectRoot } from '../db/index.ts';
import { EMBED_DIM } from './embed.ts';

export const INDEX_NAME = 'finance_docs';
export const VECTOR_DIM = EMBED_DIM; // 1024 — must equal the embedder's output dim

// Resolve the store path from the real project root (robust under `mastra dev`, which
// runs with cwd inside .mastra/output). Same approach as finance.db.
const VECTORS_PATH = join(findProjectRoot(), 'data', 'vectors.db');

export function openVectorStore(): LibSQLVector {
  return new LibSQLVector({ id: 'finance-vectors', url: `file:${VECTORS_PATH}` });
}
