import test from "node:test";
import assert from "node:assert/strict";
import { personalDelta, personalEntry } from "../public/personal-ledger.js";
import { environment, client, register } from "./support/database.mjs";
test("Personal debts, shared expenses and payments preserve both perspectives", () => {
  assert.equal(personalDelta("payment", 100, "owner", 0), 100);
  assert.equal(personalDelta("payment", 100, "peer", 0), -100);
  assert.equal(personalDelta("expense", 101, "owner", 51), 50);
  assert.equal(personalDelta("expense", 101, "peer", 51), -51);
  assert.throws(() => personalDelta("expense", 100, "owner", 101));
  assert.throws(() => personalDelta("payment", 0, "owner", 0));
  const entry = {
    amount: 101,
    owner_share: 51,
    owner_delta: 50,
    payer: "owner",
  };
  assert.equal(personalEntry(entry, false).my_delta, -50);
  assert.equal(personalEntry(entry, false).my_share, 50);
  assert.equal(personalEntry(entry, true).paid_by, "self");
});
test("Manual contacts require no invited user, stay private, and survive edits/settlements/archive", async () => {
  const env = environment(),
    a = client(env, "personal-a"),
    b = client(env, "personal-b");
  const user = await register(a, "a@example.com", "یاشار");
  await register(b, "b@example.com", "دیگری");
  const requestId = crypto.randomUUID(),
    created = await a("/people", "POST", {
      requestId,
      name: "دوست بدون حساب",
      currency: "IRT",
      note: "یادداشت خصوصی",
    });
  assert.equal(created.status, 200);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 2);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM groups").get().n, 0);
  assert.equal(
    (
      await a("/people", "POST", {
        requestId,
        name: "دوست بدون حساب",
        currency: "IRT",
      })
    ).data.id,
    created.data.id,
  );
  const base = "/people/" + created.data.id;
  assert.equal((await b(base)).status, 404);
  assert.deepEqual((await b("/people")).data.people, []);
  const payload = {
    requestId: crypto.randomUUID(),
    kind: "payment",
    title: "قرض",
    amount: 100000,
    currency: "IRT",
    paid_by: "self",
    my_share: 0,
    date: "2026-10-01",
    note: "از من به دوستم",
  };
  const e = await a(base + "/entries", "POST", payload);
  assert.equal(e.status, 200);
  assert.equal(
    (await a(base + "/entries", "POST", payload)).data.id,
    e.data.id,
  );
  assert.equal((await a(base)).data.balances.IRT, 100000);
  assert.equal((await b(base + "/entries", "POST", payload)).status, 404);
  assert.equal(
    (
      await a(base + "/entries/" + e.data.id, "PUT", {
        ...payload,
        amount: 120000,
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await a(base + "/entries/" + e.data.id, "PUT", { ...payload, version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (
      await a(base + "/entries", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
        kind: "expense",
        amount: 100001,
        my_share: 50001,
      })
    ).status,
    200,
  );
  const payment = await a(base + "/entries", "POST", {
    ...payload,
    requestId: crypto.randomUUID(),
    amount: 170000,
    paid_by: "friend",
    title: "تسویه",
  });
  assert.equal(payment.status, 200);
  assert.equal((await a(base)).data.balances.IRT, 0);
  assert.equal(
    (
      await a(base + "/entries", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
        currency: "USD",
        amount: 1000,
      })
    ).status,
    200,
  );
  assert.deepEqual((await a(base)).data.balances, { IRT: 0, USD: 1000 });
  assert.equal(
    (await a(base + "/entries/" + payment.data.id + "?version=1", "DELETE"))
      .status,
    200,
  );
  assert.equal((await a(base)).data.balances.IRT, 170000);
  assert.equal(
    (
      await a(base + "/entries", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
        kind: "expense",
        my_share: 100001,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a(base, "PUT", {
        name: "نام جدید",
        note: "یادداشت",
        archived: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await a(base + "/entries", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal((await a(base)).data.account.archived, 1);
  assert.equal((await a("/people")).data.people[0].entry_count, 3);
  assert.equal(
    (await a(base, "PUT", { name: "نام جدید", archived: false })).status,
    200,
  );
  assert.equal((await a(base)).data.entries[0].creator, user.id);
  env.db.close();
});
test("Optional shared account reveals history only after acceptance, inverts balances, and consumes the link", async () => {
  const env = environment(),
    a = client(env, "share-a"),
    b = client(env, "share-b"),
    c = client(env, "share-c");
  const ua = await register(a, "owner@example.com", "یاشار");
  const ub = await register(b, "peer@example.com", "سارا");
  await register(c, "stranger@example.com", "غریبه");
  const id = (
      await a("/people", "POST", {
        requestId: crypto.randomUUID(),
        name: "سارا",
        currency: "IRT",
        note: "PRIVATE NOTE",
      })
    ).data.id,
    base = "/people/" + id;
  const payload = {
    requestId: crypto.randomUUID(),
    kind: "expense",
    title: "شام",
    amount: 100000,
    currency: "IRT",
    paid_by: "self",
    my_share: 40000,
    date: "2026-10-01",
  };
  const e = await a(base + "/entries", "POST", payload);
  assert.equal(e.status, 200);
  const old = (await a(base + "/invite", "POST", {})).data.invite;
  assert.equal((await b(base + "/invite", "POST", {})).status, 404);
  assert.equal((await a(base + "/invite", "DELETE")).status, 200);
  assert.equal((await b("/people/join", "POST", { invite: old })).status, 404);
  const invite = (await a(base + "/invite", "POST", {})).data.invite;
  assert.equal((await a("/people/join", "POST", { invite })).status, 400);
  assert.equal((await b("/people/join", "POST", { invite })).status, 200);
  assert.equal((await c("/people/join", "POST", { invite })).status, 404);
  const ad = (await a(base)).data,
    bd = (await b(base)).data;
  assert.equal(ad.balances.IRT, 60000);
  assert.equal(bd.balances.IRT, -60000);
  assert.equal(bd.account.name, "یاشار");
  assert.equal(bd.account.personal_note, "");
  assert.equal(bd.account.invite, undefined);
  assert.equal((await c(base)).status, 404);
  assert.equal(
    (await b(base + "/entries/" + e.data.id, "PUT", { ...payload, version: 1 }))
      .status,
    403,
  );
  assert.equal(
    (await b(base + "/entries/" + e.data.id + "?version=1", "DELETE")).status,
    403,
  );
  const payment = await b(base + "/entries", "POST", {
    ...payload,
    requestId: crypto.randomUUID(),
    kind: "payment",
    amount: 60000,
    title: "تسویه",
    my_share: 0,
  });
  assert.equal(payment.status, 200);
  assert.equal((await a(base)).data.balances.IRT, 0);
  assert.equal((await b(base)).data.balances.IRT, 0);
  const peerExpense = await b(base + "/entries", "POST", {
    ...payload,
    requestId: crypto.randomUUID(),
    amount: 90000,
    my_share: 30000,
  });
  assert.equal(peerExpense.status, 200);
  assert.equal((await a(base)).data.balances.IRT, -60000);
  assert.equal((await b(base)).data.balances.IRT, 60000);
  assert.equal(
    (
      await b(base + "/entries", "POST", {
        ...payload,
        requestId: crypto.randomUUID(),
        my_share: "40000",
      })
    ).status,
    400,
  );
  assert.equal(
    (await a(base + "/entries/" + payment.data.id + "?version=1", "DELETE"))
      .status,
    403,
  );
  assert.equal(
    (await b(base, "PUT", { name: "دیگر", archived: true })).status,
    403,
  );
  assert.equal((await a(base + "/invite", "POST", {})).status, 400);
  assert.equal((await b("/people")).data.people[0].owner, ua.id);
  assert.equal(
    (await a(base)).data.entries.find((x) => x.id === payment.data.id).creator,
    ub.id,
  );
  env.db.close();
});
