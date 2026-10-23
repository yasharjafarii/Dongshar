CREATE TABLE selected_item_requests (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL REFERENCES users(id),
 payload TEXT NOT NULL,
 guard INTEGER NOT NULL CHECK(guard=1),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
