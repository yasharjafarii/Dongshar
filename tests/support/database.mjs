import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../../src/worker.js";
export function environment() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  class Query {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Query(this.sql, args);
    }
    async first() {
      return db.prepare(this.sql).get(...this.args) || null;
    }
    async all() {
      return { results: db.prepare(this.sql).all(...this.args) };
    }
    async run() {
      const r = db.prepare(this.sql).run(...this.args);
      return { meta: { changes: Number(r.changes) } };
    }
  }
  return {
    db,
    DB: {
      prepare: (sql) => new Query(sql),
      async batch(queries) {
        db.exec("BEGIN");
        try {
          const r = [];
          for (const q of queries) r.push(await q.run());
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
  };
}
export function client(env, ip) {
  let cookie = "";
  return async (path, method = "GET", body, origin = "https://dong.test") => {
    const r = await worker.fetch(
      new Request("https://dong.test/api" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
          Cookie: cookie,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
    if (r.headers.has("Set-Cookie"))
      cookie = r.headers.get("Set-Cookie").split(";")[0];
    return { status: r.status, data: await r.json() };
  };
}
export async function register(client, email, name) {
  const r = await client("/auth/register", "POST", {
    email,
    name,
    password: "correct-password-123",
  });
  if (r.status !== 200) throw Error(r.data.error);
  return r.data.user;
}
