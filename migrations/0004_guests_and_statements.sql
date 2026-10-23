CREATE TABLE group_participants (
  group_id TEXT NOT NULL REFERENCES groups(id),
  id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  contact_id TEXT REFERENCES personal_accounts(id),
  added_by TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  PRIMARY KEY(group_id,id),
  UNIQUE(group_id,user_id),
  UNIQUE(group_id,contact_id)
);
INSERT INTO group_participants(group_id,id,user_id,name)
SELECT m.group_id,u.id,u.id,u.name FROM members m JOIN users u ON u.id=m.user_id;
CREATE TRIGGER members_participant AFTER INSERT ON members BEGIN
  INSERT OR IGNORE INTO group_participants(group_id,id,user_id,name)
  SELECT NEW.group_id,u.id,u.id,u.name FROM users u WHERE u.id=NEW.user_id;
END;
CREATE TABLE settlements_v3 (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0),
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  creator TEXT NOT NULL REFERENCES users(id),
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(group_id,sender) REFERENCES group_participants(group_id,id),
  FOREIGN KEY(group_id,receiver) REFERENCES group_participants(group_id,id)
);
INSERT INTO settlements_v3 SELECT * FROM settlements;
DROP TABLE settlements;
ALTER TABLE settlements_v3 RENAME TO settlements;
CREATE INDEX settlements_group ON settlements(group_id,deleted);
ALTER TABLE recurring ADD COLUMN calendar TEXT NOT NULL DEFAULT 'gregory';
CREATE TABLE statement_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL CHECK(scope IN ('person','group')),
  account_id TEXT REFERENCES personal_accounts(id),
  group_id TEXT REFERENCES groups(id),
  participant_id TEXT,
  expires INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX statement_owner ON statement_links(owner,scope,account_id,group_id,participant_id);
