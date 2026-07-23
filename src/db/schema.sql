CREATE TABLE accounts (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card')),
  currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  payment_terms TEXT NOT NULL CHECK (payment_terms IN ('net_15','net_30','net_60'))
);

CREATE TABLE invoices (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  issue_date     TEXT NOT NULL,
  due_date       TEXT NOT NULL,
  amount         REAL NOT NULL CHECK (amount > 0),
  status         TEXT NOT NULL CHECK (status IN ('paid','open','overdue')),
  paid_date      TEXT
);

CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  date             TEXT NOT NULL,
  amount           REAL NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge','payment','refund','transfer','fee','payout')),
  category         TEXT NOT NULL,
  vendor           TEXT,
  description      TEXT NOT NULL,
  invoice_id       INTEGER REFERENCES invoices(id)
);

CREATE INDEX idx_tx_date     ON transactions(date);
CREATE INDEX idx_tx_category ON transactions(category);
CREATE INDEX idx_tx_type     ON transactions(transaction_type);
CREATE INDEX idx_tx_vendor   ON transactions(vendor);
CREATE INDEX idx_inv_status  ON invoices(status);
