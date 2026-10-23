import { balances } from "../public/ledger.js";
export async function removeMember({
  env,
  g,
  group,
  user,
  id,
  one,
  all,
  stmt,
  fail,
  audit,
  json,
}) {
  if (group.owner !== user.id)
    fail("فقط سازندهٔ گروه می‌تواند عضو را حذف کند", 403);
  if (group.archived) fail("ابتدا گروه را از بایگانی خارج کنید");
  const p = await one(
    env,
    "SELECT * FROM group_participants WHERE group_id=? AND id=?",
    g,
    id,
  );
  if (!p) fail("عضو پیدا نشد", 404);
  if (p.user_id === group.owner) fail("سازندهٔ گروه قابل حذف نیست");
  if (p.removed) return json({ ok: true });
  const es = (
    await all(env, "SELECT * FROM expenses WHERE group_id=? AND deleted=0", g)
  ).map((e) => ({
    ...e,
    allocations: JSON.parse(e.allocations),
    payers: JSON.parse(e.payers),
  }));
  const bs = balances(
    es,
    await all(
      env,
      "SELECT * FROM settlements WHERE group_id=? AND deleted=0",
      g,
    ),
  );
  if (Object.values(bs).some((b) => b[id]))
    fail(
      "این عضو ماندهٔ باز دارد؛ ابتدا هزینهٔ اشتباه را اصلاح یا حساب او را تسویه کنید",
      409,
    );
  const recurring = await all(
    env,
    "SELECT template FROM recurring WHERE group_id=? AND active=1",
    g,
  );
  if (
    recurring.some((r) => {
      const t = JSON.parse(r.template);
      return [...t.allocations, ...t.payers].some((x) => x.id === id);
    })
  )
    fail("ابتدا تکرار هزینه‌های مربوط به این عضو را متوقف کنید", 409);
  await env.DB.batch([
    stmt(
      env,
      "UPDATE group_participants SET removed=1 WHERE group_id=? AND id=?",
      g,
      id,
    ),
    stmt(
      env,
      "DELETE FROM members WHERE group_id=? AND user_id=?",
      g,
      p.user_id,
    ),
    stmt(
      env,
      "UPDATE statement_links SET revoked=1 WHERE scope='group' AND group_id=? AND (participant_id=? OR owner=?)",
      g,
      id,
      p.user_id,
    ),
    stmt(
      env,
      "UPDATE groups SET defaults=NULL,invite=? WHERE id=?",
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
      g,
    ),
    audit(env, g, user.id, `«${p.name}» را از گروه حذف کرد؛ سوابق محفوظ است`),
  ]);
  return json({ ok: true });
}
