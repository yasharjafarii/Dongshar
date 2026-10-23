import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { environment, client, register } from "./support/database.mjs";
import worker from "../src/worker.js";
import { fromJalali, toJalali, nextJalaliMonth } from "../public/jalali.js";
import { importRows } from "../public/import.js";

test("Jalali dates validate leap days, Persian/Arabic digits and monthly rollover", () => {
  assert.equal(fromJalali("۱۴۰۳/۰۱/۰۱"), "2024-03-20");
  assert.equal(fromJalali("١٤٠٤/٠١/٠١"), "2025-03-21");
  assert.equal(fromJalali("1403/12/30"), "2025-03-20");
  assert.throws(() => fromJalali("1404/12/30"));
  assert.throws(() => fromJalali("1405/07/31"));
  assert.equal(
    toJalali(nextJalaliMonth(fromJalali("1404/06/31"))),
    "1404/07/30",
  );
  assert.equal(
    toJalali(nextJalaliMonth(fromJalali("1404/11/30"))),
    "1404/12/29",
  );
  for (let y = 1390; y <= 1410; y++)
    for (let m = 1; m <= 12; m++)
      assert.equal(
        toJalali(fromJalali(`${y}/${m}/15`)),
        `${y}/${String(m).padStart(2, "0")}/15`,
      );
  const rows = importRows(
    "date,title,amount,currency,payer,participants,category\n۱۴۰۳/۰۱/۰۱,شام,100,IRT,من,من,food",
    [{ id: "a", name: "من" }],
  );
  assert.equal(rows[0].date, "2024-03-20");
});

test("V2 migration preserves existing settlements and identities", () => {
  const db = new DatabaseSync(":memory:");
  for (const f of [
    "0001_initial.sql",
    "0002_imports.sql",
    "0003_personal_accounts.sql",
  ])
    db.exec(
      readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"),
    );
  for (const id of ["a", "b"])
    db.prepare(
      "INSERT INTO users(id,name,email,password,salt,recovery) VALUES(?,?,?,?,?,?)",
    ).run(id, id, id + "@test.com", "hash", "salt", "recovery");
  db.exec(
    "INSERT INTO groups(id,name,owner,invite) VALUES('g','سفر','a','invite'); INSERT INTO members VALUES('g','a'); INSERT INTO members VALUES('g','b'); INSERT INTO settlements VALUES('s','g','b','a',100,'IRT','2026-01-01','a',0)",
  );
  const before = db.prepare("SELECT * FROM settlements").get();
  db.exec(
    readFileSync(
      new URL("../migrations/0004_guests_and_statements.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(db.prepare("SELECT * FROM settlements").get(), before);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM group_participants").get().n,
    2,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("Offline group friends and scoped anonymous statements support revocation without leaking other accounts", async () => {
  const env = environment(),
    a = client(env, "a"),
    b = client(env, "b"),
    anon = client(env, "anon");
  const host = await register(a, "host@test.com", "یاشار");
  await register(b, "outsider@test.com", "بیگانه");
  const contact = (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "سارا",
      currency: "IRT",
      note: "PRIVATE_CONTACT_NOTE",
    })
  ).data.id;
  const other = (
    await b("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "دیگری",
      currency: "IRT",
    })
  ).data.id;
  const gid = (
      await a("/groups", "POST", { name: "سفر مشترک", currency: "IRT" })
    ).data.id,
    base = "/groups/" + gid;
  const added = await a(base + "/members", "POST", { account_id: contact });
  assert.equal(added.status, 200);
  const guest = added.data.id;
  assert.equal(
    (await a(base + "/members", "POST", { account_id: contact })).data.id,
    guest,
  );
  assert.equal(
    (await a(base + "/members", "POST", { account_id: other })).status,
    404,
  );
  assert.equal(
    (await b(base + "/members", "POST", { account_id: contact })).status,
    404,
  );
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM users").get().n, 2);
  assert.equal(
    env.db.prepare("SELECT COUNT(*) n FROM members WHERE group_id=?").get(gid)
      .n,
    1,
  );
  const payload = {
    title: "شام مشترک",
    amount: 200,
    currency: "IRT",
    date: "2026-10-02",
    category: "food",
    mode: "equal",
    entries: [
      { id: host.id, value: 1 },
      { id: guest, value: 1 },
    ],
    payers: [{ id: host.id, value: 200 }],
    note: "PRIVATE_GROUP_NOTE",
  };
  assert.equal((await a(base + "/expenses", "POST", payload)).status, 200);
  assert.equal(
    (
      await a(base + "/expenses", "POST", {
        ...payload,
        title: "UNRELATED_EXPENSE",
        entries: [{ id: host.id, value: 1 }],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await a("/people/" + contact + "/entries", "POST", {
        requestId: crypto.randomUUID(),
        kind: "payment",
        title: "قرض",
        amount: 50,
        currency: "IRT",
        paid_by: "self",
        date: "2026-10-02",
      })
    ).status,
    200,
  );
  const scope = { scope: "person", account_id: contact, days: 7 },
    created = await a("/statements", "POST", scope);
  assert.equal(created.status, 200);
  const { token, id } = created.data;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(
    env.db.prepare("SELECT token_hash FROM statement_links WHERE id=?").get(id)
      .token_hash,
    token,
  );
  const report = await anon("/public/" + token);
  assert.equal(report.status, 200);
  assert.equal(report.data.balances.IRT, -150);
  assert.equal(report.data.sections.length, 2);
  const text = JSON.stringify(report.data);
  for (const secret of [
    "PRIVATE_CONTACT_NOTE",
    "PRIVATE_GROUP_NOTE",
    "UNRELATED_EXPENSE",
    "host@test.com",
    "password",
    "invite",
    "owner_delta",
    "token_hash",
  ])
    assert.equal(text.includes(secret), false, secret);
  assert.equal((await anon("/public/" + token, "POST", {})).status, 405);
  assert.equal((await anon(base)).status, 401);
  assert.equal((await b("/statements", "POST", scope)).status, 404);
  assert.equal((await b("/statements/" + id, "DELETE")).status, 404);
  const response = await worker.fetch(
    new Request("https://dong.test/api/public/" + token),
    env,
  );
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
  assert.equal(
    (
      await a(base + "/settlements", "POST", {
        sender: guest,
        receiver: host.id,
        amount: 100,
        currency: "IRT",
        date: "2026-10-02",
      })
    ).status,
    200,
  );
  assert.equal((await anon("/public/" + token)).data.balances.IRT, -50);
  const replacement = (await a("/statements", "POST", scope)).data;
  assert.equal((await anon("/public/" + token)).status, 404);
  assert.equal(
    (await a("/statements/" + replacement.id, "DELETE")).status,
    200,
  );
  assert.equal((await anon("/public/" + replacement.token)).status, 404);
  const groupLink = await a("/statements", "POST", {
    scope: "group",
    group_id: gid,
    participant_id: guest,
  });
  assert.equal(groupLink.status, 200);
  assert.equal(
    (await anon("/public/" + groupLink.data.token)).data.balances.IRT,
    0,
  );
  env.db
    .prepare("UPDATE statement_links SET expires=0 WHERE id=?")
    .run(groupLink.data.id);
  assert.equal((await anon("/public/" + groupLink.data.token)).status, 404);
  assert.deepEqual(env.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("A manual participant keeps historical identity after accepting an account and joining a group", async () => {
  const env = environment(),
    a = client(env, "host"),
    b = client(env, "friend");
  const host = await register(a, "a@test.com", "الف"),
    friend = await register(b, "b@test.com", "ب");
  const contact = (
    await a("/people", "POST", {
      requestId: crypto.randomUUID(),
      name: "ب",
      currency: "IRT",
    })
  ).data.id;
  const gid = (await a("/groups", "POST", { name: "خانه", currency: "IRT" }))
      .data.id,
    base = "/groups/" + gid;
  const guest = (await a(base + "/members", "POST", { account_id: contact }))
    .data.id;
  const invite = (await a("/people/" + contact + "/invite", "POST", {})).data
    .invite;
  assert.equal((await b("/people/join", "POST", { invite })).status, 200);
  const group = (await a(base)).data.group;
  assert.equal(
    (await b("/join", "POST", { invite: group.invite })).status,
    200,
  );
  const result = (await b(base)).data;
  assert.equal(result.group.my_member_id, guest);
  assert.equal(result.members.length, 2);
  assert.equal(result.members.find((m) => m.id === guest).user_id, friend.id);
  assert.equal(
    (await b(base + "/members", "POST", { account_id: contact })).status,
    403,
  );
  assert.equal(
    (
      await b(base + "/settlements", "POST", {
        sender: guest,
        receiver: host.id,
        amount: 10,
        currency: "IRT",
        date: "2026-10-02",
      })
    ).status,
    200,
  );
  const next = (
    await a("/groups", "POST", { name: "سفر دوم", currency: "IRT" })
  ).data.id;
  assert.equal(
    (await a("/groups/" + next + "/members", "POST", { account_id: contact }))
      .status,
    200,
  );
  assert.equal((await b("/groups/" + next)).status, 200);
});
