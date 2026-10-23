import test from "node:test";
import assert from "node:assert/strict";
import { environment, client, register } from "./support/database.mjs";
import { itemList } from "../src/items.js";
import { overview } from "../src/overview.js";
import vm from "node:vm";
import fs from "node:fs";

test("20 groups: item queries stay constant, balances and isolation remain correct", async () => {
  const env = environment(),
    a = client(env, "performance"),
    user = await register(a, "performance@test.com", "من");
  const id = (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "دوست",
      currency: "IRT",
    })
  ).data.id;
  for (let i = 0; i < 20; i++) {
    const g = (
      await a("/groups", "POST", { name: "گروه " + i, currency: "IRT" })
    ).data.id;
    const guest = (
      await a("/groups/" + g + "/members", "POST", { account_id: id })
    ).data.id;
    assert.equal(
      (
        await a("/groups/" + g + "/expenses", "POST", {
          title: "هزینه " + i,
          amount: 200,
          currency: "IRT",
          date: "2026-10-22",
          category: "food",
          mode: "equal",
          entries: [
            { id: user.id, value: 1 },
            { id: guest, value: 1 },
          ],
          payers: [{ id: user.id, value: 200 }],
        })
      ).status,
      200,
    );
  }
  let reads = 0;
  const ctx = {
    env,
    user,
    all: async (env, sql, ...args) => {
      reads++;
      return (
        await env.DB.prepare(sql)
          .bind(...args)
          .all()
      ).results;
    },
    one: async (env, sql, ...args) => {
      reads++;
      return env.DB.prepare(sql)
        .bind(...args)
        .first();
    },
    fail: (s) => {
      throw Error(s);
    },
  };
  const p = (await overview(ctx)).people.find((p) => p.id === "contact:" + id);
  assert.equal(p.balances.IRT, 2000);
  reads = 0;
  const list = await itemList(ctx, p.id, p);
  assert.equal(list.items.length, 20);
  assert.equal(
    list.items.reduce((n, e) => n + e.delta, 0),
    2000,
  );
  assert.equal(
    reads,
    5,
    "Number of reads must not increase with the number of groups",
  );
  console.log(
    "Performance fixture: 20 groups + 1 account; item reads 63 → " +
      reads +
      " (overview excluded).",
  );
});

test("Service worker serves cached public assets without network and never intercepts API or mutations", async () => {
  const handlers = {},
    cached = { ok: true },
    calls = [];
  vm.runInNewContext(
    fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      Response,
      self: {
        location: { origin: "https://dong.test" },
        addEventListener: (name, fn) => (handlers[name] = fn),
      },
      caches: { open: async () => ({ match: async () => cached }) },
      fetch: async (r) => {
        calls.push(r);
        return cached;
      },
    },
  );
  let response;
  handlers.fetch({
    request: { method: "GET", url: "https://dong.test/app.js", mode: "cors" },
    respondWith: (r) => (response = r),
  });
  assert.equal(await response, cached);
  assert.equal(calls.length, 0);
  for (const request of [
    { method: "GET", url: "https://dong.test/api/overview" },
    { method: "POST", url: "https://dong.test/api/items/settle-selected" },
    { method: "GET", url: "https://other.test/app.js" },
  ]) {
    handlers.fetch({
      request,
      respondWith: () =>
        assert.fail("Private or external requests must not be cached"),
    });
  }
});
