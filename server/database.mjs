// Self-hosted D1 substitute: a persistent SQLite database behind the same
// prepare/bind/first/all/run/batch surface the Worker uses on Cloudflare.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

class Query {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Query(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args) };
  }
  async run() {
    return { meta: changes(this.db.prepare(this.sql).run(...this.args)) };
  }
}
const changes = (r) => ({ changes: Number(r.changes) });

function migrate(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => row.name),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(path.join(migrationsDir, name), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations(name, applied_at) VALUES(?,?)").run(
        name,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${name} failed: ${error.message}`);
    }
  }
}

export function openDatabase(file) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  db.exec("PRAGMA foreign_keys=ON");
  migrate(db);
  const env = {
    DB: {
      prepare: (sql) => new Query(db, sql),
      // Runs synchronously, without a single await, so no other request can
      // interleave statements inside the transaction — matching D1 batch.
      batch(queries) {
        db.exec("BEGIN");
        try {
          const results = queries.map((q) =>
            changes(db.prepare(q.sql).run(...q.args)),
          );
          db.exec("COMMIT");
          return results.map((meta) => ({ meta }));
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  return { env, db, close: () => db.close() };
}
