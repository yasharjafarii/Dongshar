import test from "node:test";
import assert from "node:assert/strict";
import { scheduled } from "../src/worker.js";
import { environment, client } from "./support/database.mjs";
test("Multi-user lifecycle, authorization, concurrency, receipts, recurrence and recovery", async () => {
  const env = environment(),
    a = client(env, "1"),
    b = client(env, "2"),
    stranger = client(env, "3");
  const ar = await a("/auth/register", "POST", {
    email: "a@test.com",
    name: "الف",
    password: "a-long-password",
  });
  assert.equal(ar.status, 200);
  assert.equal(ar.data.recovery.length, 64);
  const aid = ar.data.user.id;
  const br = await b("/auth/register", "POST", {
    email: "b@test.com",
    name: "ب",
    password: "another-password",
  });
  assert.equal(br.status, 200);
  const bid = br.data.user.id;
  const sr = await stranger("/auth/register", "POST", {
    email: "c@test.com",
    name: "ج",
    password: "stranger-password",
  });
  assert.equal(sr.status, 200);
  assert.equal(
    (
      await a(
        "/groups",
        "POST",
        { name: "سفر", currency: "IRT" },
        "https://evil.test",
      )
    ).status,
    403,
  );
  const created = await a("/groups", "POST", { name: "سفر", currency: "IRT" });
  assert.equal(created.status, 200);
  const gid = created.data.id,
    base = "/groups/" + gid;
  assert.equal((await stranger(base)).status, 404);
  const group = (await a(base)).data.group;
  assert.equal(
    (await b("/join", "POST", { invite: group.invite })).status,
    200,
  );
  const payload = {
    title: "شام",
    amount: 101,
    currency: "IRT",
    date: "2026-01-31",
    category: "food",
    mode: "equal",
    entries: [
      { id: aid, value: 1 },
      { id: bid, value: 1 },
    ],
    payers: [{ id: aid, value: 101 }],
    note: "سلام",
    cadence: "monthly",
  };
  assert.equal(
    (
      await a(base + "/expenses", "POST", {
        ...payload,
        entries: [{ id: "outsider", value: 1 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await a(base + "/expenses", "POST", { ...payload, amount: 100 })).status,
    400,
  );
  payload.requestId = crypto.randomUUID();
  const expense = await a(base + "/expenses", "POST", payload);
  assert.equal(
    (await a(base + "/expenses", "POST", payload)).data.id,
    expense.data.id,
  );
  assert.equal(expense.status, 200);
  const eid = expense.data.id;
  const data = (await b(base)).data;
  assert.deepEqual(
    data.expenses[0].allocations.map((p) => p.value),
    [51, 50],
  );
  assert.equal(data.recurring.length, 1);
  assert.equal(data.expenses.length, 1);
  assert.equal(
    (
      await a(base + "/expenses", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
        mode: "percent",
        entries: [{ id: aid, value: 90 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await b(base + "/expenses/" + eid, "PUT", { ...payload, version: 1 }))
      .status,
    403,
  );
  assert.equal(
    (
      await a(base + "/expenses/" + eid, "PUT", {
        ...payload,
        title: "شام جدید",
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await a(base + "/expenses/" + eid, "PUT", { ...payload, version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (
      await b(base + "/expenses/" + eid + "/comments", "POST", {
        body: "ممنون",
      })
    ).status,
    200,
  );
  assert.equal(
    (await a(base + "/expenses/" + eid + "/comments")).data[0].body,
    "ممنون",
  );
  assert.equal(
    (await stranger(base + "/expenses/" + eid + "/receipt")).status,
    404,
  );
  assert.equal(
    (
      await b(base + "/settlements", "POST", {
        sender: bid,
        receiver: aid,
        amount: 50,
        currency: "IRT",
        date: "2026-02-01",
      })
    ).status,
    200,
  );
  await scheduled(env, new Date("2026-03-02"));
  await scheduled(env, new Date("2026-03-02"));
  const after = (await a(base)).data;
  assert.equal(after.expenses.length, 2);
  assert.equal(after.recurring[0].next_date, "2026-03-31");
  const key = crypto.randomUUID();
  assert.equal(
    (
      await a(base + "/import", "POST", {
        key,
        rows: [{ ...payload, title: "CSV" }],
      })
    ).status,
    200,
  );
  assert.equal(
    (await a(base + "/import", "POST", { key, rows: [payload] })).status,
    200,
  );
  assert.equal((await a(base)).data.expenses.length, 3);
  assert.equal(
    (
      await a(base + "/import", "POST", {
        key: crypto.randomUUID(),
        rows: [payload, { ...payload, payers: [] }],
      })
    ).status,
    400,
  );
  assert.equal((await a(base)).data.expenses.length, 3);
  assert.equal(
    (await a(base, "PUT", { name: "سفر", archived: true })).status,
    200,
  );
  assert.equal((await b(base + "/expenses", "POST", payload)).status, 400);
  const recovery = client(env, "4");
  assert.equal(
    (
      await recovery("/auth/recover", "POST", {
        email: "a@test.com",
        password: "new-long-password",
        recovery: ar.data.recovery,
      })
    ).status,
    200,
  );
  assert.equal((await a("/me")).status, 401);
  assert.equal(
    (
      await recovery("/auth/login", "POST", {
        email: "a@test.com",
        password: "new-long-password",
      })
    ).status,
    200,
  );
  env.db.close();
});
test("Auth rate limit and session logout", async () => {
  const env = environment(),
    a = client(env, "5");
  await a("/auth/register", "POST", {
    email: "x@test.com",
    name: "ایکس",
    password: "long-password",
  });
  assert.equal((await a("/auth/logout", "POST", {})).status, 200);
  assert.equal((await a("/me")).status, 401);
  let r;
  for (let i = 0; i < 16; i++)
    r = await a("/auth/login", "POST", {
      email: "x@test.com",
      password: "wrong-password",
    });
  assert.equal(r.status, 429);
  env.db.close();
});
