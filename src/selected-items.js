import { itemList } from "./items.js";

export async function selectedItemsRoute(ctx) {
  const { path, method, b, env, user, one, stmt, fail, json, uid, date } = ctx;
  if (path !== "/items/settle-selected") return null;
  if (method !== "POST") fail("روش نامعتبر", 405);
  if (typeof b.requestId !== "string" || !/^[-\w]{16,80}$/.test(b.requestId))
    fail("شناسهٔ درخواست نامعتبر است");
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 1000)
    fail("بین ۱ تا ۱۰۰۰ مورد انتخاب کنید");
  if (
    b.items.some(
      (x) => !x || typeof x.key !== "string" || !Number.isInteger(x.version),
    ) ||
    new Set(b.items.map((x) => x.key)).size !== b.items.length
  )
    fail("موارد انتخاب‌شده نامعتبر یا تکراری هستند");
  const d = date(b.date),
    payload = JSON.stringify({
      person: b.person,
      date: d,
      items: b.items
        .map(({ key, version }) => ({ key, version }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    });
  const previous = await one(
    env,
    "SELECT owner,payload FROM selected_item_requests WHERE id=?",
    b.requestId,
  );
  if (previous) {
    if (previous.owner !== user.id || previous.payload !== payload)
      fail("شناسهٔ درخواست قبلاً استفاده شده است", 409);
    return json({ ok: true, already: true });
  }
  const revision = (
    await one(env, "SELECT value FROM ledger_revision WHERE id=1")
  ).value;
  const data = await itemList(ctx, b.person),
    byKey = new Map(data.items.map((x) => [x.key, x]));
  const selected = b.items.map((x) => {
    const item = byKey.get(x.key);
    if (!item) fail("یکی از موارد در این حساب وجود ندارد", 404);
    if (item.settled || item.archived || item.version !== x.version)
      fail(
        "یکی از موارد تغییر کرده، تسویه شده یا بایگانی است؛ صفحه را تازه کنید",
        409,
      );
    return { ...item, payment: uid() };
  });
  const encoded = JSON.stringify(selected);
  try {
    await env.DB.batch([
      stmt(
        env,
        "INSERT INTO selected_item_requests(id,owner,payload,guard) VALUES(?,?,?,CASE WHEN (SELECT value FROM ledger_revision WHERE id=1)=? THEN 1 ELSE 0 END)",
        b.requestId,
        user.id,
        payload,
        revision,
      ),
      stmt(
        env,
        "INSERT INTO item_settlements(source_key,scope,source_id,payment_id,creator) SELECT json_extract(value,'$.key'),json_extract(value,'$.scope'),json_extract(value,'$.id'),json_extract(value,'$.payment'),? FROM json_each(?)",
        user.id,
        encoded,
      ),
      stmt(
        env,
        "INSERT INTO personal_entries(id,account_id,creator,kind,title,amount,currency,payer,owner_share,owner_delta,date,note) SELECT json_extract(value,'$.payment'),json_extract(value,'$.account_id'),?,'payment','تسویهٔ '||json_extract(value,'$.title'),abs(json_extract(value,'$.delta')),json_extract(value,'$.currency'),CASE WHEN json_extract(value,'$.owner_delta')>0 THEN 'peer' ELSE 'owner' END,0,-json_extract(value,'$.owner_delta'),?,'تسویهٔ موارد انتخاب‌شده' FROM json_each(?) WHERE json_extract(value,'$.scope')='person'",
        user.id,
        d,
        encoded,
      ),
      stmt(
        env,
        "INSERT INTO settlements(id,group_id,sender,receiver,amount,currency,date,creator) SELECT json_extract(value,'$.payment'),json_extract(value,'$.group_id'),json_extract(value,'$.sender'),json_extract(value,'$.receiver'),abs(json_extract(value,'$.delta')),json_extract(value,'$.currency'),?,? FROM json_each(?) WHERE json_extract(value,'$.scope')='group'",
        d,
        user.id,
        encoded,
      ),
    ]);
  } catch (e) {
    if (/constraint/i.test(String(e)))
      fail("حساب تغییر کرد؛ صفحه را تازه کنید و دوباره بررسی کنید", 409);
    throw e;
  }
  return json({ ok: true, count: selected.length });
}
