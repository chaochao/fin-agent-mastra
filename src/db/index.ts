import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve paths from the project root (process.cwd()), NOT import.meta.url. Mastra
// bundles tools into .mastra/output/, so an import.meta.url-relative path would point
// at the bundle and miss the real data/ dir and schema.sql. npm scripts run from the
// project root, so cwd is stable for `npm run dev|seed|test`.
export const DB_PATH = join(process.cwd(), 'data', 'finance.db');
const SCHEMA_PATH = join(process.cwd(), 'src', 'db', 'schema.sql');

// Opens a DB and applies the schema. Pass a fresh/empty path (':memory:' in tests,
// a rebuilt file in seed.ts). Not for reopening an already-seeded file.
// Schema is read here (lazily) so importing DB_PATH alone never touches the filesystem.
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

// Opens the existing data/finance.db for read (Day 3 tool). Does not apply schema.
let _db: Database.Database | undefined;
export default function db(): Database.Database {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}
