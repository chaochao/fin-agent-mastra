// Day 3 rails: run LLM-generated SQL safely.
// Guarantees: read-only connection (writes physically fail), single SELECT only,
// no comments/extra statements, auto-LIMIT to bound result size.
import Database from 'better-sqlite3';
import { DB_PATH } from './index.ts';

export const MAX_ROWS = 1000;

// Singleton read-only connection to the seeded finance.db (used by the tool).
let _ro: Database.Database | undefined;
export function readOnlyDb(): Database.Database {
  if (!_ro) _ro = new Database(DB_PATH, { readonly: true });
  return _ro;
}

export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeSqlError';
  }
}

// Replace single-quoted string literals with '' so keyword/`;`/comment scans
// can't be fooled or false-triggered by text inside literals.
function stripLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

// Validate that `sql` is a single, read-only SELECT. Returns the cleaned query
// (trailing semicolons stripped) or throws UnsafeSqlError with a clear reason.
export function validateSelect(sql: string): string {
  const query = sql.trim().replace(/;+\s*$/, '').trim();
  if (query.length === 0) throw new UnsafeSqlError('Empty query.');

  const scan = stripLiterals(query);
  if (/--|\/\*/.test(scan)) throw new UnsafeSqlError('SQL comments are not allowed.');
  if (scan.includes(';')) throw new UnsafeSqlError('Only a single statement is allowed (remove ";").');
  if (!/^\s*(select|with)\b/i.test(scan)) {
    throw new UnsafeSqlError('Only SELECT queries are allowed (must start with SELECT or WITH).');
  }
  const banned = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|truncate|grant|revoke)\b/i;
  const m = scan.match(banned);
  if (m) throw new UnsafeSqlError(`Only read-only SELECT queries are allowed ("${m[1]}" is not permitted).`);

  return query;
}

export type SafeSqlResult =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

// Validate + run a query against a given DB. Auto-appends LIMIT if absent.
export function runSafeSqlOn(
  db: Database.Database,
  sql: string,
  maxRows: number = MAX_ROWS,
): SafeSqlResult {
  let query: string;
  try {
    query = validateSelect(sql);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!/\blimit\b/i.test(stripLiterals(query))) {
    query = `${query} LIMIT ${maxRows}`;
  }

  try {
    const rows = db.prepare(query).all() as Record<string, unknown>[];
    return { ok: true, rows, rowCount: rows.length, truncated: rows.length >= maxRows };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Convenience: run against the default read-only finance.db (used by the tool).
export function runSafeSql(sql: string, maxRows: number = MAX_ROWS): SafeSqlResult {
  return runSafeSqlOn(readOnlyDb(), sql, maxRows);
}
