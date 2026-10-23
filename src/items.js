import { overview } from "./overview.js";
import { balances, simplify } from "../public/ledger.js";
export async function itemList(ctx, key, selectedPerson) {
  const { env, user, all, fail } = ctx,
    p =
      selectedPerson || (await overview(ctx)).people.find((p) => p.id === key);
  if (!p) fail("حساب پیدا نشد", 404);
  const items = [];
  const accountIds = JSON.stringify(p.accounts.map((a) => a.id)),
    groupIds = JSON.stringify([...new Set(p.groups.map((g) => g.id))]);
  const [personalRows, selfRows, expenseRows, linkRows] = await Promise.all([
    p.accounts.length
      ? all(
          env,
          "SELECT e.id,e.account_id,e.title,e.date,e.currency,e.owner_delta,e.version,a.owner,l.payment_id,l.creator settlement_creator FROM personal_entries e JOIN personal_accounts a ON a.id=e.account_id LEFT JOIN item_settlements l ON l.source_key='person:'||e.id WHERE e.account_id IN (SELECT value FROM json_each(?)) AND e.deleted=0 AND NOT EXISTS(SELECT 1 FROM item_settlements z WHERE z.payment_id=e.id) AND NOT EXISTS(SELECT 1 FROM batch_payments z WHERE z.payment_id=e.id) ORDER BY e.date DESC",
          accountIds,
        )
      : [],
    p.groups.length
      ? all(
          env,
          "SELECT id,group_id FROM group_participants WHERE group_id IN (SELECT value FROM json_each(?)) AND user_id=?",
          groupIds,
          user.id,
        )
      : [],
    p.groups.length
      ? all(
          env,
          "SELECT id,group_id,title,date,amount,currency,allocations,payers,version FROM expenses WHERE group_id IN (SELECT value FROM json_each(?)) AND deleted=0 ORDER BY date DESC",
          groupIds,
        )
      : [],
    p.groups.length
      ? all(
          env,
          "SELECT l.source_key,l.creator FROM item_settlements l JOIN expenses e ON e.id=l.source_id WHERE l.scope='group' AND e.group_id IN (SELECT value FROM json_each(?))",
          groupIds,
        )
      : [],
  ]);
  const accountsById = new Map(p.accounts.map((a) => [a.id, a])),
    selves = new Map(selfRows.map((s) => [s.group_id, s])),
    linksByKey = new Map(linkRows.map((l) => [l.source_key, l]));
  const expensesByGroup = new Map();
  for (const e of expenseRows) {
    if (!expensesByGroup.has(e.group_id)) expensesByGroup.set(e.group_id, []);
    expensesByGroup.get(e.group_id).push(e);
  }
  for (const e of personalRows) {
    const a = accountsById.get(e.account_id);

    if (!e.owner_delta) continue;
    items.push({
      key: "person:" + e.id,
      scope: "person",
      id: e.id,
      account_id: a.id,
      title: e.title,
      date: e.date,
      currency: e.currency,
      delta: e.owner === user.id ? e.owner_delta : -e.owner_delta,
      owner_delta: e.owner_delta,
      version: e.version,
      settled: !!e.payment_id,
      can_undo: e.settlement_creator === user.id,
      archived: a.archived,
      source: "حساب شخصی",
    });
  }
  for (const g of p.groups) {
    const self = selves.get(g.id);
    if (!self) continue;
    const rows = expensesByGroup.get(g.id) || [];
    for (const e of rows) {
      const b = balances(
          [
            {
              ...e,
              allocations: JSON.parse(e.allocations),
              payers: JSON.parse(e.payers),
            },
          ],
          [],
        )[e.currency],
        pair = simplify(b).find(
          (t) =>
            (t.sender === self.id && t.receiver === g.participant_id) ||
            (t.receiver === self.id && t.sender === g.participant_id),
        );
      if (!pair) continue;
      const k =
        "group:" + e.id + ":" + [pair.sender, pair.receiver].sort().join(":");
      items.push({
        key: k,
        scope: "group",
        id: e.id,
        group_id: g.id,
        title: e.title,
        date: e.date,
        currency: e.currency,
        delta: pair.receiver === self.id ? pair.amount : -pair.amount,
        sender: pair.sender,
        receiver: pair.receiver,
        version: e.version,
        settled: linksByKey.has(k),
        can_undo: linksByKey.get(k)?.creator === user.id,
        archived: g.archived,
        source: g.name,
      });
    }
  }
  const closures = new Set(
    (
      await all(
        env,
        "SELECT c.item_key FROM bulk_item_closures c WHERE (c.scope='person' AND c.source_id IN (SELECT e.id FROM personal_entries e JOIN personal_accounts a ON a.id=e.account_id WHERE a.owner=? OR a.peer_user_id=?)) OR (c.scope='group' AND c.source_id IN (SELECT e.id FROM expenses e JOIN members m ON m.group_id=e.group_id WHERE m.user_id=?))",
        user.id,
        user.id,
        user.id,
      )
    ).map((r) => r.item_key),
  );
  for (const item of items)
    if (closures.has(item.key)) {
      item.settled = true;
      item.can_undo = false;
      item.bulk = true;
    }
  return {
    name: p.name,
    items: items.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
export async function itemsRoute(ctx) {
  const {
    path,
    method,
    url,
    b,
    env,
    user,
    all,
    one,
    stmt,
    fail,
    json,
    uid,
    date,
  } = ctx;
  if (path !== "/items" && !["/items/settle", "/items/undo"].includes(path))
    return null;
  const key = method === "GET" ? url.searchParams.get("person") : b.person;
  const data = await itemList(ctx, key);
  if (method === "GET" && path === "/items") return json(data);
  if (method !== "POST" || !["/items/settle", "/items/undo"].includes(path))
    fail("روش نامعتبر", 405);
  const item = data.items.find((e) => e.key === b.item);
  if (!item) fail("آیتم پیدا نشد", 404);
  if (path === "/items/undo") {
    if (item.bulk)
      fail("این مورد با تسویهٔ کلی بسته شده؛ همان تسویهٔ کلی را لغو کنید", 409);
    if (!item.settled) return json({ ok: true });
    const link = await one(
      env,
      "SELECT * FROM item_settlements WHERE source_key=?",
      item.key,
    );
    if (link.creator !== user.id)
      fail("فقط ثبت‌کننده می‌تواند این تسویه را لغو کند", 403);
    if (item.archived) fail("ابتدا دفتر یا گروه را از بایگانی خارج کنید");
    const table = item.scope === "person" ? "personal_entries" : "settlements";
    await env.DB.batch([
      stmt(env, `UPDATE ${table} SET deleted=1 WHERE id=?`, link.payment_id),
      stmt(
        env,
        "DELETE FROM item_settlements WHERE source_key=? AND payment_id=?",
        item.key,
        link.payment_id,
      ),
    ]);
    return json({ ok: true });
  }
  if (item.settled) return json({ ok: true, already: true });
  if (item.archived) fail("ابتدا دفتر یا گروه را از بایگانی خارج کنید");
  if (b.version !== item.version)
    fail("آیتم تغییر کرده؛ دوباره بررسی کنید", 409);
  const d = date(b.date),
    payment = uid(),
    table = item.scope === "person" ? "personal_entries" : "expenses";
  const batch = [
    stmt(
      env,
      `INSERT OR IGNORE INTO item_settlements(source_key,scope,source_id,payment_id,creator) SELECT ?,?,?,?,? FROM ${table} WHERE id=? AND version=? AND deleted=0`,
      item.key,
      item.scope,
      item.id,
      payment,
      user.id,
      item.id,
      item.version,
    ),
  ];
  if (item.scope === "person")
    batch.push(
      stmt(
        env,
        "INSERT INTO personal_entries(id,account_id,creator,kind,title,amount,currency,payer,owner_share,owner_delta,date,note) SELECT ?,?,?,'payment',?,?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM item_settlements WHERE source_key=? AND payment_id=?)",
        payment,
        item.account_id,
        user.id,
        "تسویهٔ " + item.title,
        Math.abs(item.delta),
        item.currency,
        item.owner_delta > 0 ? "peer" : "owner",
        -item.owner_delta,
        d,
        "تسویهٔ اختصاصی این مورد؛ پرداخت‌های کلی قبلی به آیتم‌ها تخصیص داده نمی‌شوند.",
        item.key,
        payment,
      ),
    );
  else
    batch.push(
      stmt(
        env,
        "INSERT INTO settlements(id,group_id,sender,receiver,amount,currency,date,creator) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM item_settlements WHERE source_key=? AND payment_id=?)",
        payment,
        item.group_id,
        item.sender,
        item.receiver,
        Math.abs(item.delta),
        item.currency,
        d,
        user.id,
        item.key,
        payment,
      ),
    );
  await env.DB.batch(batch);
  if (
    !(await one(
      env,
      "SELECT payment_id FROM item_settlements WHERE source_key=?",
      item.key,
    ))
  )
    fail("آیتم تغییر کرده؛ صفحه را تازه کنید", 409);
  return json({ ok: true });
}
