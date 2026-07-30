import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Find the real project root. Neither import.meta.url nor process.cwd() is reliable:
// `mastra dev` bundles this module into .mastra/output/ AND runs with cwd there, so
// both point inside the bundle. Walk up until we find src/db/schema.sql — a marker that
// exists only at the repo root, never in the bundle. Works for `npm run dev|seed|test`.
export function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'src', 'db', 'schema.sql'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd(); // fallback
}

const ROOT = findProjectRoot();
export const DB_PATH = join(ROOT, 'data', 'finance.db');
const SCHEMA_PATH = join(ROOT, 'src', 'db', 'schema.sql');

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
