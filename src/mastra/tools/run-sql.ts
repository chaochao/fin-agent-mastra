// Day 3 tool: let the agent answer questions by running its own read-only SQL.
// The safety rails live in src/db/safe-sql.ts — this tool is a thin wrapper that
// returns rows on success, or { ok:false, error } so the agent can fix and retry.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runSafeSql } from '../../db/safe-sql.ts';

export const runSqlTool = createTool({
  id: 'run_sql',
  description:
    'Run a single read-only SQLite SELECT against the finance database and get rows back. ' +
    'Use it to answer any question about transactions, invoices, customers, or accounts. ' +
    'Only SELECT (or WITH ... SELECT) is allowed — writes, multiple statements, and comments are rejected. ' +
    'On error you receive the error text; fix your SQL and call the tool again.',
  inputSchema: z.object({
    query: z.string().describe('A single read-only SQLite SELECT statement.'),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    rows: z.array(z.any()).optional(),
    rowCount: z.number().optional(),
    truncated: z.boolean().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ query }) => runSafeSql(query),
});
