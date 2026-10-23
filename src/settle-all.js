import { overview } from "./overview.js";
import { itemList } from "./items.js";
import { balances, simplify } from "../public/ledger.js";
async function plan(ctx, key) {
  const { env, user, one, all, fail, digest } = ctx,
    revision = (await one(env, "SELECT value FROM ledger_revision WHERE id=1"))
      .value;
  const p = (await overview(ctx)).people.find((p) => p.id === key);
  if (!p) fail("حساب پیدا نشد", 404);
  const rows = [];
  for (const a of p.accounts) {
    const account = await one(
      env,
      "SELECT owner FROM personal_accounts WHERE id=?",
      a.id,
    );
    for (const [c, n] of Object.entries(a.balances))
      if (n)
        rows.push({
          scope: "person",
          id: a.id,
          name: a.name,
          currency: c,
          delta: n,
          owner_delta: account.owner === user.id ? n : -n,
        });
  }
  for (const g of p.groups) {
    const self = await one(
      env,
      "SELECT id FROM group_participants WHERE group_id=? AND user_id=?",
      g.id,
      user.id,
    );
    const es = (
      await all(
        env,
        "SELECT amount,currency,payers,allocations FROM expenses WHERE group_id=? AND deleted=0",
        g.id,
      )
    ).map((e) => ({
      ...e,
      payers: JSON.parse(e.payers),
      allocations: JSON.parse(e.allocations),
    }));
    const bs = balances(
      es,
      await all(
        env,
        "SELECT sender,receiver,amount,currency FROM settlements WHERE group_id=? AND deleted=0",
        g.id,
      ),
    );
    for (const [c, b] of Object.entries(bs)) {
      let delta = 0;
      for (let i = 0; i < 201; i++) {
        const t = simplify(b).find(
          (t) =>
            (t.sender === self.id && t.receiver === g.participant_id) ||
            (t.receiver === self.id && t.sender === g.participant_id),
        );
        if (!t) break;
        if (i === 200) fail("محاسبهٔ تسویه کامل نشد", 409);
        b[t.sender] += t.amount;
        b[t.receiver] -= t.amount;
        delta += t.receiver === self.id ? t.amount : -t.amount;
      }
      if (delta)
        rows.push({
          scope: "group",
          id: g.id,
          name: g.name,
          currency: c,
          delta,
          sender: delta > 0 ? g.participant_id : self.id,
          receiver: delta > 0 ? self.id : g.participant_id,
        });
    }
  }
  const items = (await itemList(ctx, key, p)).items
    .filter((e) => !e.settled)
    .map((e) => ({ key: e.key, id: e.id, scope: e.scope, version: e.version }));
  if (
    (await one(env, "SELECT value FROM ledger_revision WHERE id=1")).value !==
    revision
  )
    fail("حساب‌ها تغییر کردند؛ دوباره بررسی کنید", 409);
  const totals = {};
  for (const r of rows)
    totals[r.currency] = (totals[r.currency] || 0) + r.delta;
  const fingerprint = await digest(
    JSON.stringify({ owner: user.id, key, revision, rows, items }),
  );
  const batches = await all(
    env,
    "SELECT id,created_at FROM settlement_batches WHERE owner=? AND person=? AND reversed=0 ORDER BY created_at DESC",
    user.id,
    key,
  );
  return { name: p.name, rows, items, totals, fingerprint, revision, batches };
}
export async function settleAllRoute(ctx) {
  const {
    path,
    method,
    url,
    b,
    env,
    user,
    one,
    all,
    stmt,
    uid,
    fail,
    date,
    json,
  } = ctx;
  if (!path.startsWith("/settle-all")) return null;
  if (path === "/settle-all/undo" && method === "POST") {
    const batch = await one(
      env,
      "SELECT * FROM settlement_batches WHERE id=? AND owner=?",
      String(b.id),
      user.id,
    );
    if (!batch) fail("تسویه پیدا نشد", 404);
    if (batch.reversed) return json({ ok: true });
    await plan(ctx, batch.person); // Still requires access to this person's books.
    const payments = await all(
        env,
        "SELECT * FROM batch_payments WHERE batch_id=?",
        batch.id,
      ),
      queries = [];
    for (const p of payments) {
      const allowed =
        p.scope === "person"
          ? await one(
              env,
              "SELECT 1 FROM personal_entries e JOIN personal_accounts a ON a.id=e.account_id WHERE e.id=? AND (a.owner=? OR a.peer_user_id=?)",
              p.payment_id,
              user.id,
              user.id,
            )
          : await one(
              env,
              "SELECT 1 FROM settlements s JOIN members m ON m.group_id=s.group_id WHERE s.id=? AND m.user_id=?",
              p.payment_id,
              user.id,
            );
      if (!allowed) fail("به یکی از دفترهای این تسویه دیگر دسترسی ندارید", 403);
      queries.push(
        stmt(
          env,
          `UPDATE ${p.scope === "person" ? "personal_entries" : "settlements"} SET deleted=1 WHERE id=?`,
          p.payment_id,
        ),
      );
    }
    queries.push(
      stmt(env, "DELETE FROM bulk_item_closures WHERE batch_id=?", batch.id),
      stmt(
        env,
        "UPDATE settlement_batches SET reversed=1 WHERE id=?",
        batch.id,
      ),
    );
    await env.DB.batch(queries);
    return json({ ok: true });
  }
  if (path !== "/settle-all" || !["GET", "POST"].includes(method))
    fail("مسیر نامعتبر", 404);
  const key = method === "GET" ? url.searchParams.get("person") : b.person;
  if (method === "POST") {
    if (!/^[a-f0-9-]{36}$/.test(String(b.requestId)))
      fail("شناسهٔ درخواست نامعتبر است");
    const prior = await one(
      env,
      "SELECT * FROM settlement_batches WHERE id=?",
      b.requestId,
    );
    if (prior) {
      if (prior.owner !== user.id || prior.person !== key)
        fail("شناسه تکراری", 409);
      return json({ ok: true, id: prior.id });
    }
  }
  const p = await plan(ctx, key);
  if (method === "GET")
    return json({ ...p, items: undefined, revision: undefined });
  if (b.fingerprint !== p.fingerprint)
    fail("مانده تغییر کرده است؛ پیش‌نمایش جدید را تأیید کنید", 409);
  const d = date(b.date),
    id = b.requestId,
    queries = [
      stmt(
        env,
        "INSERT INTO settlement_batches(id,owner,person,guard) SELECT ?,?,?,CASE WHEN value=? THEN 1 ELSE 0 END FROM ledger_revision WHERE id=1",
        id,
        user.id,
        key,
        p.revision,
      ),
    ];
  for (const r of p.rows) {
    const payment = uid();
    if (r.scope === "person")
      queries.push(
        stmt(
          env,
          "INSERT INTO personal_entries(id,account_id,creator,kind,title,amount,currency,payer,owner_share,owner_delta,date,note) VALUES(?,?,?,'payment','تسویهٔ کلی',?,?,?,0,?,?,?)",
          payment,
          r.id,
          user.id,
          Math.abs(r.delta),
          r.currency,
          r.owner_delta > 0 ? "peer" : "owner",
          -r.owner_delta,
          d,
          "تسویهٔ کلی؛ پرداخت خالص و تهاتر بین دفترها با تأیید کاربر",
        ),
        stmt(
          env,
          "INSERT INTO personal_activity(id,account_id,user_id,message) VALUES(?,?,?,?)",
          uid(),
          r.id,
          user.id,
          "تسویهٔ کلی را ثبت کرد",
        ),
      );
    else
      queries.push(
        stmt(
          env,
          "INSERT INTO settlements(id,group_id,sender,receiver,amount,currency,date,creator) VALUES(?,?,?,?,?,?,?,?)",
          payment,
          r.id,
          r.sender,
          r.receiver,
          Math.abs(r.delta),
          r.currency,
          d,
          user.id,
        ),
        stmt(
          env,
          "INSERT INTO activity(id,group_id,user_id,message) VALUES(?,?,?,?)",
          uid(),
          r.id,
          user.id,
          "تسویهٔ کلی با " + p.name + " را ثبت کرد",
        ),
      );
    queries.push(
      stmt(
        env,
        "INSERT INTO batch_payments(payment_id,batch_id,scope) VALUES(?,?,?)",
        payment,
        id,
        r.scope,
      ),
    );
  }
  if (p.items.length)
    queries.push(
      stmt(
        env,
        "INSERT OR IGNORE INTO bulk_item_closures(item_key,batch_id,scope,source_id) SELECT json_extract(value,'$.key'),?,json_extract(value,'$.scope'),json_extract(value,'$.id') FROM json_each(?)",
        id,
        JSON.stringify(p.items),
      ),
    );
  try {
    await env.DB.batch(queries);
  } catch (e) {
    if (String(e).includes("CHECK constraint"))
      fail("حساب تغییر کرد؛ پیش‌نمایش را دوباره دریافت کنید", 409);
    throw e;
  }
  return json({ ok: true, id });
}
