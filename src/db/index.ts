import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, 'schema.sql'), 'utf8');
export const DB_PATH = join(here, '..', '..', 'data', 'finance.db');

// Opens a DB and applies the schema. Pass a fresh/empty path (':memory:' in tests,
// a rebuilt file in seed.ts). Not for reopening an already-seeded file.
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// Opens the existing data/finance.db for read (Day 3 tool). Does not apply schema.
let _db: Database.Database | undefined;
export default function db(): Database.Database {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}
