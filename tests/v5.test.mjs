import test from "node:test";
import assert from "node:assert/strict";
import { environment, client, register } from "./support/database.mjs";
test("Personal item settlement changes only that item, is idempotent, protected and reversible", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b");
  await register(a, "a@test.com", "من");
  await register(b, "b@test.com", "دیگری");
  const id = (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "سارا",
      currency: "IRT",
    })
  ).data.id;
  const key = "contact:" + id,
    base = "/people/" + id;
  for (const title of ["بستنی", "شام"])
    assert.equal(
      (
        await a(base + "/entries", "POST", {
          requestId: crypto.randomUUID(),
          title,
          kind: "expense",
          amount: 200,
          currency: "IRT",
          paid_by: "friend",
          my_share: 100,
          date: "2026-10-22",
        })
      ).status,
      200,
    );
  let list = (await a("/items?person=" + key)).data.items;
  assert.equal(list.length, 2);
  const ice = list.find((x) => x.title === "بستنی"),
    payload = {
      person: key,
      item: ice.key,
      version: ice.version,
      date: "2026-10-22",
    };
  assert.equal((await b("/items?person=" + key)).status, 404);
  assert.equal((await b("/items/settle", "POST", payload)).status, 404);
  assert.equal(
    (await a("/items/settle", "POST", { ...payload, version: 99 })).status,
    409,
  );
  assert.equal((await a("/items/settle", "POST", payload)).status, 200);
  assert.equal((await a("/items/settle", "POST", payload)).status, 200);
  const account = (await a(base)).data;
  assert.equal(account.balances.IRT, -100);
  assert.equal(account.entries.length, 3);
  list = (await a("/items?person=" + key)).data.items;
  assert.equal(list.length, 2);
  assert.equal(list.find((x) => x.title === "بستنی").settled, true);
  assert.equal(list.find((x) => x.title === "شام").settled, false);
  assert.equal(
    (await a(base + "/entries/" + ice.id + "?version=1", "DELETE")).status,
    409,
  );
  const payment = env.db
    .prepare("SELECT payment_id FROM item_settlements WHERE source_key=?")
    .get(ice.key).payment_id;
  assert.equal(
    (await a(base + "/entries/" + payment + "?version=1", "DELETE")).status,
    409,
  );
  assert.equal((await a("/items/undo", "POST", payload)).status, 200);
  assert.equal((await a(base)).data.balances.IRT, -200);
  assert.equal((await a("/items/settle", "POST", payload)).status, 200);
  assert.equal((await a(base)).data.balances.IRT, -100);
  assert.deepEqual(env.db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("Group item settlement is shared across both perspectives and does not settle a different expense", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b"),
    host = await register(a, "a@test.com", "الف"),
    friend = await register(b, "b@test.com", "ب");
  const g = (await a("/groups", "POST", { name: "سفر", currency: "IRT" })).data
      .id,
    base = "/groups/" + g;
  await b("/join", "POST", { invite: (await a(base)).data.group.invite });
  for (const title of ["بستنی", "شام"])
    await a(base + "/expenses", "POST", {
      title,
      amount: 200,
      currency: "IRT",
      date: "2026-10-22",
      category: "food",
      mode: "equal",
      entries: [
        { id: host.id, value: 1 },
        { id: friend.id, value: 1 },
      ],
      payers: [{ id: friend.id, value: 200 }],
    });
  const ice = (await a("/items?person=user:" + friend.id)).data.items.find(
    (x) => x.title === "بستنی",
  );
  const payload = {
    person: "user:" + friend.id,
    item: ice.key,
    version: ice.version,
    date: "2026-10-22",
  };
  assert.equal(ice.delta, -100);
  assert.equal((await a("/items/settle", "POST", payload)).status, 200);
  const other = (await b("/items?person=user:" + host.id)).data.items.find(
    (x) => x.title === "بستنی",
  );
  assert.equal(other.key, ice.key);
  assert.equal(other.settled, true);
  assert.equal(other.delta, 100);
  assert.equal(
    (await b("/items/undo", "POST", { ...payload, person: "user:" + host.id }))
      .status,
    403,
  );
  assert.equal((await a("/overview")).data.people[0].balances.IRT, -100);
  assert.equal(
    (await a(base + "/expenses/" + ice.id + "?version=1", "DELETE")).status,
    409,
  );
  const payment = (await a(base)).data.settlements[0].id;
  assert.equal(
    (await a(base + "/settlements/" + payment, "DELETE")).status,
    409,
  );
  assert.equal((await a("/items/undo", "POST", payload)).status, 200);
  assert.equal((await a("/overview")).data.people[0].balances.IRT, -200);
});
