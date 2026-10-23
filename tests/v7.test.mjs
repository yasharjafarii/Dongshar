import test from "node:test";
import assert from "node:assert/strict";
import { environment, client, register } from "./support/database.mjs";
async function setup() {
  const env = environment(),
    a = client(env, "a");
  await register(a, "a@test.com", "من");
  const id = (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "سارا",
      currency: "IRT",
    })
  ).data.id;
  for (const [title, paid_by, currency] of [
    ["بستنی", "friend", "IRT"],
    ["شام", "self", "IRT"],
    ["سفر", "friend", "USD"],
  ])
    assert.equal(
      (
        await a(`/people/${id}/entries`, "POST", {
          requestId: crypto.randomUUID(),
          title,
          kind: "expense",
          amount: 200,
          currency,
          paid_by,
          my_share: 100,
          date: "2026-10-22",
        })
      ).status,
      200,
    );
  const person = "contact:" + id,
    items = (await a("/items?person=" + person)).data.items;
  return {
    env,
    a,
    id,
    items,
    payload: {
      person,
      items: items
        .filter((x) => x.currency === "IRT")
        .map(({ key, version }) => ({ key, version })),
      date: "2026-10-22",
      requestId: crypto.randomUUID(),
    },
  };
}
test("Selected settlement is atomic, idempotent, leaves other currencies open and supports individual undo", async () => {
  const { env, a, id, items, payload } = await setup();
  assert.equal(
    (await a("/items/settle-selected", "POST", payload)).status,
    200,
  );
  assert.equal(
    (await a("/items/settle-selected", "POST", payload)).status,
    200,
  );
  const list = (await a("/items?person=" + payload.person)).data.items;
  assert.deepEqual(
    list.map((x) => x.settled),
    list.map((x) => x.currency === "IRT"),
  );
  assert.equal((await a("/people/" + id)).data.balances.USD, -100);
  assert.equal(
    env.db.prepare("SELECT count(*) n FROM item_settlements").get().n,
    2,
  );
  assert.equal(
    (
      await a("/items/settle-selected", "POST", {
        ...payload,
        date: "2026-10-23",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a("/items/undo", "POST", {
        person: payload.person,
        item: payload.items[0].key,
      })
    ).status,
    200,
  );
  assert.equal(
    (await a("/items/settle-selected", "POST", payload)).status,
    200,
  );
  assert.equal(
    env.db.prepare("SELECT count(*) n FROM item_settlements").get().n,
    1,
  );
});
test("Invalid, stale, duplicate and unauthorized selections cannot partially settle", async () => {
  const { env, a, payload } = await setup();
  for (const [items, status] of [
    [[], 400],
    [[payload.items[0], payload.items[0]], 400],
    [[payload.items[0], { ...payload.items[1], version: 99 }], 409],
    [[payload.items[0], { key: "person:unknown", version: 1 }], 404],
  ])
    assert.equal(
      (await a("/items/settle-selected", "POST", { ...payload, items })).status,
      status,
    );
  const other = client(env, "b");
  await register(other, "b@test.com", "دیگری");
  assert.equal(
    (await other("/items/settle-selected", "POST", payload)).status,
    404,
  );
  assert.equal(
    env.db.prepare("SELECT count(*) n FROM item_settlements").get().n,
    0,
  );
  const batch = env.DB.batch;
  env.DB.batch = async (q) => {
    env.db.exec("UPDATE ledger_revision SET value=value+1");
    return batch(q);
  };
  assert.equal(
    (await a("/items/settle-selected", "POST", payload)).status,
    409,
  );
  assert.equal(
    env.db.prepare("SELECT count(*) n FROM item_settlements").get().n,
    0,
  );
  assert.equal(
    env.db.prepare("SELECT count(*) n FROM selected_item_requests").get().n,
    0,
  );
});
test("Group selection settles only selected expenses on both sides", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b");
  const host = await register(a, "a@test.com", "من"),
    friend = await register(b, "b@test.com", "دوست");
  const g = (await a("/groups", "POST", { name: "سفر", currency: "IRT" })).data
      .id,
    base = "/groups/" + g;
  await b("/join", "POST", { invite: (await a(base)).data.group.invite });
  for (const title of ["یک", "دو", "سه"])
    assert.equal(
      (
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
        })
      ).status,
      200,
    );
  const person = "user:" + friend.id,
    items = (await a("/items?person=" + person)).data.items;
  assert.equal(
    (
      await a("/items/settle-selected", "POST", {
        person,
        items: items.slice(0, 2).map(({ key, version }) => ({ key, version })),
        date: "2026-10-22",
        requestId: crypto.randomUUID(),
      })
    ).status,
    200,
  );
  assert.equal((await a("/overview")).data.people[0].balances.IRT, -100);
  assert.equal(
    (await b("/items?person=user:" + host.id)).data.items.filter(
      (x) => x.settled,
    ).length,
    2,
  );
  assert.deepEqual(env.db.prepare("PRAGMA foreign_key_check").all(), []);
});
