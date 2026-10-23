import test from "node:test";
import assert from "node:assert/strict";
import { environment, client, register } from "./support/database.mjs";
function mailbox(env) {
  const mails = [];
  env.APP_URL = "https://dong.test";
  env.EMAIL_FROM = "Dongshar <accounts@example.com>";
  env.RESEND_API_KEY = "test-secret";
  env.MAILER = {
    async fetch(_url, opts) {
      mails.push(JSON.parse(opts.body));
      return new Response('{"id":"sent"}', { status: 200 });
    },
  };
  return mails;
}
const tokenFrom = (m, p) =>
  m.text.match(new RegExp("#" + p + "=([a-f0-9]{64})"))?.[1];
test("Email verification/reset links expire, are single-use, rotate recovery and revoke sessions", async () => {
  const env = environment(),
    mails = mailbox(env),
    a = client(env, "a");
  const u = await register(a, "a@test.com", "الف");
  assert.equal(mails.length, 1);
  const verify = tokenFrom(mails[0], "verify");
  assert.ok(verify);
  assert.equal(
    (await a("/auth/verify-email", "POST", { token: verify })).status,
    200,
  );
  assert.equal(
    (await a("/auth/verify-email", "POST", { token: verify })).status,
    400,
  );
  assert.equal((await a("/auth/security")).data.verified, true);
  const anon = client(env, "anon"),
    unknown = await anon("/auth/forgot-password", "POST", {
      email: "unknown@test.com",
    }),
    known = await anon("/auth/forgot-password", "POST", {
      email: "a@test.com",
    });
  assert.deepEqual(known, unknown);
  const reset = tokenFrom(mails.at(-1), "reset");
  assert.ok(reset);
  assert.equal(
    env.db
      .prepare("SELECT COUNT(*) n FROM email_tokens WHERE token_hash=?")
      .get(reset).n,
    0,
  );
  assert.equal(
    (
      await anon("/auth/reset-password", "POST", {
        token: reset,
        password: "new-password-123",
      })
    ).status,
    200,
  );
  assert.equal((await a("/me")).status, 401);
  assert.equal(
    (
      await anon("/auth/reset-password", "POST", {
        token: reset,
        password: "another-password-123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a("/auth/login", "POST", {
        email: "a@test.com",
        password: "correct-password-123",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await a("/auth/login", "POST", {
        email: "a@test.com",
        password: "new-password-123",
      })
    ).status,
    200,
  );
  await anon("/auth/forgot-password", "POST", { email: "a@test.com" });
  const expired = tokenFrom(mails.at(-1), "reset");
  env.db.prepare("UPDATE email_tokens SET expires=0 WHERE used IS NULL").run();
  assert.equal(
    (
      await anon("/auth/reset-password", "POST", {
        token: expired,
        password: "another-password-123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a("/auth/change-password", "POST", {
        current_password: "wrong",
        password: "new-password-456",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await a("/auth/change-password", "POST", {
        current_password: "new-password-123",
        password: "new-password-456",
      })
    ).status,
    200,
  );
  assert.equal((await a("/me")).status, 401);
  assert.ok(mails.some((m) => m.subject === "رمز عبور دنگشار تغییر کرد"));
});
test("Email setup failures are explicit, origin protected and recovery invalidates older email links", async () => {
  const env = environment(),
    a = client(env, "a");
  await register(a, "a@test.com", "الف");
  assert.equal(
    (await a("/auth/forgot-password", "POST", { email: "a@test.com" })).status,
    503,
  );
  const mails = mailbox(env);
  await a("/auth/forgot-password", "POST", { email: "a@test.com" });
  const raw = tokenFrom(mails.at(-1), "reset");
  assert.equal(
    (
      await a(
        "/auth/reset-password",
        "POST",
        { token: raw, password: "new-password-123" },
        "https://evil.test",
      )
    ).status,
    403,
  );
  await a("/auth/change-password", "POST", {
    current_password: "correct-password-123",
    password: "new-password-456",
  });
  assert.equal(
    (
      await a("/auth/reset-password", "POST", {
        token: raw,
        password: "attacker-password",
      })
    ).status,
    400,
  );
});
test("Full settlement clears personal and group books, all currencies and items atomically, with stale preview protection and undo", async () => {
  const env = environment(),
    a = client(env, "a"),
    outsider = client(env, "out");
  const user = await register(a, "a@test.com", "الف");
  await register(outsider, "o@test.com", "دیگری");
  const id = (
      await a("/people", "POST", {
        requestId: crypto.randomUUID(),
        name: "سارا",
        currency: "IRT",
      })
    ).data.id,
    key = "contact:" + id,
    base = "/people/" + id;
  await a(base + "/entries", "POST", {
    requestId: crypto.randomUUID(),
    kind: "expense",
    title: "بستنی",
    amount: 200,
    currency: "IRT",
    paid_by: "friend",
    my_share: 100,
    date: "2026-10-22",
  });
  await a(base + "/entries", "POST", {
    requestId: crypto.randomUUID(),
    kind: "payment",
    title: "دلار",
    amount: 700,
    currency: "USD",
    paid_by: "self",
    date: "2026-10-22",
  });
  const gid = (await a("/groups", "POST", { name: "سفر", currency: "IRT" }))
      .data.id,
    g = "/groups/" + gid,
    guest = (await a(g + "/members", "POST", { account_id: id })).data.id;
  await a(g + "/expenses", "POST", {
    title: "شام",
    amount: 600,
    currency: "IRT",
    date: "2026-10-22",
    category: "food",
    mode: "equal",
    entries: [
      { id: user.id, value: 1 },
      { id: guest, value: 1 },
    ],
    payers: [{ id: user.id, value: 600 }],
  });
  const first = await a("/settle-all?person=" + key);
  assert.equal(first.status, 200);
  assert.equal(first.data.totals.IRT, 200);
  assert.equal(first.data.totals.USD, 700);
  const req = {
    person: key,
    requestId: crypto.randomUUID(),
    fingerprint: first.data.fingerprint,
    date: "2026-10-22",
  };
  assert.equal((await outsider("/settle-all", "POST", req)).status, 404);
  await a(base, "PUT", { name: "سارا", note: "", archived: true });
  assert.equal((await a("/settle-all", "POST", req)).status, 409);
  const preview = (await a("/settle-all?person=" + key)).data;
  req.fingerprint = preview.fingerprint;
  let result = await a("/settle-all", "POST", req);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal((await a("/settle-all", "POST", req)).status, 200);
  assert.ok(
    Object.values((await a("/overview")).data.people[0].balances).every(
      (n) => n === 0,
    ),
  );
  assert.ok(
    (await a("/items?person=" + key)).data.items.every((e) => e.settled),
  );
  assert.equal(
    (await a("/settle-all/undo", "POST", { id: req.requestId })).status,
    200,
  );
  const restored = (await a("/overview")).data.people[0];
  assert.equal(restored.balances.IRT, 200);
  assert.equal(restored.balances.USD, 700);
  assert.ok(
    (await a("/items?person=" + key)).data.items.every((e) => !e.settled),
  );
  assert.deepEqual(env.db.prepare("PRAGMA foreign_key_check").all(), []);
});
