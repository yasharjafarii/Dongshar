CREATE TABLE personal_accounts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IRT',
  personal_note TEXT NOT NULL DEFAULT '',
  peer_user_id TEXT REFERENCES users(id),
  invite TEXT UNIQUE,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(peer_user_id IS NULL OR peer_user_id <> owner)
);
CREATE INDEX personal_owner ON personal_accounts(owner, archived);
CREATE INDEX personal_peer ON personal_accounts(peer_user_id, archived);
CREATE TABLE personal_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES personal_accounts(id),
  creator TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('expense','payment')),
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 1000000000000),
  currency TEXT NOT NULL,
  payer TEXT NOT NULL CHECK(payer IN ('owner','peer')),
  owner_share INTEGER NOT NULL CHECK(owner_share >= 0 AND owner_share <= amount),
  owner_delta INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX personal_entries_account ON personal_entries(account_id, deleted, date);
CREATE TABLE personal_activity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES personal_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX personal_activity_account ON personal_activity(account_id, created_at);
