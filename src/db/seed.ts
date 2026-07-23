import type Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { openDb, DB_PATH } from './index.ts';
import {
  SEED, generateAccounts, generateCustomers, generateInvoices, generateTransactions,
} from './generate.ts';
import { createRng } from './rng.ts';

export function seedInto(db: Database.Database) {
  const rng = createRng(SEED);
  const accounts = generateAccounts();
  const customers = generateCustomers(rng);
  const invoices = generateInvoices(rng, customers);
  const transactions = generateTransactions(rng, accounts, invoices);

  const insertAccount = db.prepare('INSERT INTO accounts (id,name,type,currency) VALUES (@id,@name,@type,@currency)');
  const insertCustomer = db.prepare('INSERT INTO customers (id,name,email,payment_terms) VALUES (@id,@name,@email,@payment_terms)');
  const insertInvoice = db.prepare('INSERT INTO invoices (id,customer_id,invoice_number,issue_date,due_date,amount,status,paid_date) VALUES (@id,@customer_id,@invoice_number,@issue_date,@due_date,@amount,@status,@paid_date)');
  const insertTx = db.prepare('INSERT INTO transactions (account_id,date,amount,transaction_type,category,vendor,description,invoice_id) VALUES (@account_id,@date,@amount,@transaction_type,@category,@vendor,@description,@invoice_id)');

  const run = db.transaction(() => {
    for (const a of accounts) insertAccount.run(a);
    for (const c of customers) insertCustomer.run(c);
    for (const i of invoices) insertInvoice.run(i);
    for (const t of transactions) insertTx.run(t);
  });
  run();

  return { accounts: accounts.length, customers: customers.length, invoices: invoices.length, transactions: transactions.length };
}

// Run directly: rebuild data/finance.db from scratch.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  const db = openDb(DB_PATH);
  const counts = seedInto(db);
  console.log('Seeded data/finance.db:', counts);
  db.close();
}
