import test from "node:test";
import assert from "node:assert/strict";
import { environment, client, register } from "./support/database.mjs";
const contact = async (a, name = "سارا") =>
  (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name,
      currency: "IRT",
    })
  ).data.id;
const group = async (a) =>
  (await a("/groups", "POST", { name: "سفر", currency: "IRT" })).data.id;
const expense = (host, guest) => ({
  title: "شام",
  amount: 200,
  currency: "IRT",
  date: "2026-10-02",
  category: "food",
  mode: "equal",
  entries: [
    { id: host, value: 1 },
    { id: guest, value: 1 },
  ],
  payers: [{ id: host, value: 200 }],
});
test("Global balances net personal and multiple groups, preserve currencies, identities and access isolation", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b"),
    anon = client(env, "none");
  const host = await register(a, "a@test.com", "الف");
  await register(b, "b@test.com", "ب");
  const id = await contact(a),
    sameName = await contact(a),
    g1 = await group(a),
    g2 = await group(a);
  for (const g of [g1, g2]) {
    const guest = (
      await a("/groups/" + g + "/members", "POST", { account_id: id })
    ).data.id;
    assert.equal(
      (await a("/groups/" + g + "/expenses", "POST", expense(host.id, guest)))
        .status,
      200,
    );
  }
  assert.equal(
    (
      await a("/people/" + id + "/entries", "POST", {
        requestId: crypto.randomUUID(),
        kind: "payment",
        title: "دریافت شخصی",
        amount: 50,
        currency: "IRT",
        paid_by: "friend",
        date: "2026-10-02",
      })
    ).status,
    200,
  );
  const usd = await a("/people/" + id + "/entries", "POST", {
    requestId: crypto.randomUUID(),
    kind: "payment",
    title: "دلار",
    amount: 700,
    currency: "USD",
    paid_by: "self",
    date: "2026-10-02",
  });
  assert.equal(usd.status, 200);
  let data = (await a("/overview")).data.people,
    p = data.find((p) => p.accounts.some((a) => a.id === id));
  assert.equal(p.balances.IRT, 150);
  assert.equal(p.personal_balances.IRT, -50);
  assert.equal(p.group_balances.IRT, 200);
  assert.equal(p.balances.USD, 700);
  assert.equal(p.groups.length, 2);
  assert.equal(data.length, 2);
  assert.notEqual(
    p.id,
    data.find((p) => p.accounts.some((a) => a.id === sameName)).id,
  );
  await a("/groups/" + g2, "PUT", { name: "سفر", archived: true });
  assert.equal(
    (await a("/overview")).data.people.find((p) => p.id === "contact:" + id)
      .balances.IRT,
    150,
  );
  assert.deepEqual((await b("/overview")).data.people, []);
  assert.equal((await anon("/overview")).status, 401);
  const guest = "guest:" + id;
  await a("/groups/" + g1 + "/settlements", "POST", {
    sender: guest,
    receiver: host.id,
    amount: 100,
    currency: "IRT",
    date: "2026-10-02",
  });
  assert.equal(
    (await a("/overview")).data.people.find((p) => p.id === "contact:" + id)
      .balances.IRT,
    50,
  );
});
test("Group-only registered friends appear once across groups and merge with connected personal accounts", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b"),
    host = await register(a, "a@test.com", "الف"),
    friend = await register(b, "b@test.com", "ب");
  for (let i = 0; i < 2; i++) {
    const g = await group(a),
      invite = (await a("/groups/" + g)).data.group.invite;
    await b("/join", "POST", { invite });
    await a("/groups/" + g + "/expenses", "POST", expense(host.id, friend.id));
  }
  let ps = (await a("/overview")).data.people;
  assert.equal(ps.length, 1);
  assert.equal(ps[0].balances.IRT, 200);
  assert.equal(ps[0].accounts.length, 0);
  assert.equal((await b("/overview")).data.people[0].balances.IRT, -200);
  const id = await contact(a, "ب"),
    invite = (await a("/people/" + id + "/invite", "POST", {})).data.invite;
  await b("/people/join", "POST", { invite });
  ps = (await a("/overview")).data.people;
  assert.equal(ps.length, 1);
  assert.equal(ps[0].accounts[0].id, id);
  assert.equal(ps[0].balances.IRT, 200);
});
test("Member removal retains history, blocks open debts, revokes access and permits restoration", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b"),
    host = await register(a, "a@test.com", "الف");
  const friend = await register(b, "b@test.com", "ب"),
    id = await contact(a, "ب"),
    g = await group(a),
    base = "/groups/" + g;
  const guest = (await a(base + "/members", "POST", { account_id: id })).data
    .id;
  assert.equal(
    (await a(base + "/members/" + encodeURIComponent(host.id), "DELETE"))
      .status,
    400,
  );
  assert.equal(
    (await b(base + "/members/" + encodeURIComponent(guest), "DELETE")).status,
    404,
  );
  assert.equal(
    (await a(base + "/members/" + encodeURIComponent(guest), "DELETE")).status,
    200,
  );
  assert.equal(
    (await a(base + "/expenses", "POST", expense(host.id, guest))).status,
    400,
  );
  assert.equal(
    (await a(base + "/members", "POST", { account_id: id })).data.id,
    guest,
  );
  assert.equal(
    (await a(base + "/expenses", "POST", expense(host.id, guest))).status,
    200,
  );
  assert.equal(
    (await a(base + "/members/" + encodeURIComponent(guest), "DELETE")).status,
    409,
  );
  await a(base + "/settlements", "POST", {
    sender: guest,
    receiver: host.id,
    amount: 100,
    currency: "IRT",
    date: "2026-10-02",
  });
  const invite = (await a("/people/" + id + "/invite", "POST", {})).data.invite;
  await b("/people/join", "POST", { invite });
  // Restoring/linking a previously manual participant must not create a duplicate identity.
  assert.equal(
    (await a(base + "/members", "POST", { account_id: id })).status,
    200,
  );
  assert.equal((await b(base)).data.group.my_member_id, guest);
  assert.equal(
    (await b(base + "/members/" + encodeURIComponent(guest), "DELETE")).status,
    403,
  );
  const oldInvite = (await a(base)).data.group.invite,
    link = (
      await a("/statements", "POST", {
        scope: "group",
        group_id: g,
        participant_id: guest,
      })
    ).data;
  assert.equal(
    (await a(base + "/members/" + encodeURIComponent(guest), "DELETE")).status,
    200,
  );
  assert.equal((await b(base)).status, 404);
  assert.equal((await b("/join", "POST", { invite: oldInvite })).status, 404);
  assert.equal((await b("/public/" + link.token)).status, 404);
  const data = (await a(base)).data;
  assert.equal(data.expenses.length, 1);
  assert.equal(data.settlements.length, 1);
  assert.equal(data.members.find((m) => m.id === guest).removed, 1);
  assert.equal(
    (await a(base + "/members", "POST", { account_id: id })).status,
    200,
  );
  assert.equal((await b(base)).data.members.length, 2);
  assert.deepEqual(env.db.prepare("PRAGMA foreign_key_check").all(), []);
});
