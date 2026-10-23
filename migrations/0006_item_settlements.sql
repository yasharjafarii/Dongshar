CREATE TABLE item_settlements (
 source_key TEXT PRIMARY KEY,
 scope TEXT NOT NULL,
 source_id TEXT NOT NULL,
 payment_id TEXT NOT NULL UNIQUE,
 creator TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX item_source ON item_settlements(scope,source_id);
