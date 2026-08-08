import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { join } from 'node:path';
import { financeAgent } from './agents/finance-agent.ts';
import { findProjectRoot } from '../db/index.ts';

// Memory storage: threads, messages, and working memory persist here.
// Separate file from finance.db (structured data) and vectors.db (documents) —
// three stores, three concerns. Path resolved from the real project root so it
// works under `mastra dev` (which runs with cwd inside .mastra/output).
const MEMORY_PATH = join(findProjectRoot(), 'data', 'memory.db');

export const mastra = new Mastra({
  agents: { financeAgent },
  storage: new LibSQLStore({ id: 'finance-memory', url: `file:${MEMORY_PATH}` }),
});
