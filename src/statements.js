import { balances, simplify } from "../public/ledger.js";

function pairBalance(expenses, settlements, host, viewer) {
  const out = {};
  for (const [c, b] of Object.entries(balances(expenses, settlements))) {
    out[c] = simplify(b).reduce(
      (n, p) =>
        n +
        (p.sender === host && p.receiver === viewer
          ? p.amount
          : p.sender === viewer && p.receiver === host
            ? -p.amount
            : 0),
      0,
    );
  }
  return out;
}
export async function reportData(ctx, link) {
  const { env, one, all, fail } = ctx,
    host = await one(env, "SELECT name FROM users WHERE id=?", link.owner);
  if (!host) fail("گزارش در دسترس نیست", 404);
  const sections = [];
  let viewerName = "",
    groups = [];
  if (link.scope === "person") {
    const a = await one(
      env,
      "SELECT a.*,u.name AS owner_name,p.name AS peer_name FROM personal_accounts a JOIN users u ON u.id=a.owner LEFT JOIN users p ON p.id=a.peer_user_id WHERE a.id=? AND (a.owner=? OR a.peer_user_id=?)",
      link.account_id,
      link.owner,
      link.owner,
    );
    if (!a) fail("گزارش در دسترس نیست", 404);
    const hostIsOwner = a.owner === link.owner,
      peer = hostIsOwner ? a.peer_user_id : a.owner;
    viewerName = hostIsOwner ? a.name : a.owner_name;
    const entries = await all(
        env,
        "SELECT * FROM personal_entries WHERE account_id=? AND deleted=0 ORDER BY date DESC,created_at DESC,id",
        a.id,
      ),
      net = {};
    const rows = entries.map((e) => {
      const delta = hostIsOwner ? -e.owner_delta : e.owner_delta;
      net[e.currency] = (net[e.currency] || 0) + delta;
      return {
        title: e.title,
        date: e.date,
        currency: e.currency,
        total: e.amount,
        kind: e.kind,
        viewer_share:
          e.kind === "expense"
            ? hostIsOwner
              ? e.amount - e.owner_share
              : e.owner_share
            : null,
        host_share:
          e.kind === "expense"
            ? hostIsOwner
              ? e.owner_share
              : e.amount - e.owner_share
            : null,
        viewer_paid:
          e.payer === (hostIsOwner ? "peer" : "owner") ? e.amount : 0,
        host_paid: e.payer === (hostIsOwner ? "owner" : "peer") ? e.amount : 0,
        viewer_delta: delta,
        note: e.note,
      };
    });
    sections.push({ title: "حساب فردی", kind: "person", balances: net, rows });
    groups = await all(
      env,
      `SELECT g.id,g.name,h.id AS host_id,p.id AS viewer_id FROM groups g JOIN members m ON m.group_id=g.id AND m.user_id=? JOIN group_participants h ON h.group_id=g.id AND h.user_id=? JOIN group_participants p ON p.group_id=g.id WHERE (p.contact_id=? AND p.added_by=?) OR (p.user_id IS NOT NULL AND p.user_id=?) ORDER BY g.created_at,g.id`,
      link.owner,
      link.owner,
      a.id,
      link.owner,
      peer,
    );
  } else {
    groups = await all(
      env,
      "SELECT g.id,g.name,h.id AS host_id,p.id AS viewer_id,COALESCE(u.name,p.name) AS viewer_name FROM groups g JOIN members m ON m.group_id=g.id AND m.user_id=? JOIN group_participants h ON h.group_id=g.id AND h.user_id=? JOIN group_participants p ON p.group_id=g.id AND p.id=? LEFT JOIN users u ON u.id=p.user_id WHERE g.id=?",
      link.owner,
      link.owner,
      link.participant_id,
      link.group_id,
    );
    if (!groups.length || groups[0].host_id === groups[0].viewer_id)
      fail("گزارش در دسترس نیست", 404);
    viewerName = groups[0].viewer_name;
  }
  if (groups.length) {
    if (groups.length > 80)
      fail(
        "تعداد گروه‌های این گزارش زیاد است؛ لینک هر گروه را جدا بسازید",
        400,
      );
    const ids = [...new Set(groups.map((g) => g.id))],
      marks = ids.map(() => "?").join(",");
    const [expenses, payments] = await Promise.all([
      all(
        env,
        `SELECT group_id,title,amount,currency,date,allocations,payers FROM expenses WHERE deleted=0 AND group_id IN (${marks}) ORDER BY date DESC,created_at DESC`,
        ...ids,
      ),
      all(
        env,
        `SELECT group_id,sender,receiver,amount,currency,date FROM settlements WHERE deleted=0 AND group_id IN (${marks}) ORDER BY date DESC`,
        ...ids,
      ),
    ]);
    for (const g of groups) {
      const es = expenses
          .filter((e) => e.group_id === g.id)
          .map((e) => ({
            ...e,
            payers: JSON.parse(e.payers),
            allocations: JSON.parse(e.allocations),
          })),
        ps = payments.filter((p) => p.group_id === g.id);
      const rows = [];
      for (const e of es) {
        const paid = (id) => e.payers.find((x) => x.id === id)?.value || 0,
          share = (id) => e.allocations.find((x) => x.id === id)?.value || 0;
        if (
          !(paid(g.host_id) || share(g.host_id)) ||
          !(paid(g.viewer_id) || share(g.viewer_id))
        )
          continue;
        rows.push({
          title: e.title,
          date: e.date,
          currency: e.currency,
          total: e.amount,
          kind: "expense",
          viewer_paid: paid(g.viewer_id),
          viewer_share: share(g.viewer_id),
          host_paid: paid(g.host_id),
          host_share: share(g.host_id),
        });
      }
      for (const p of ps) {
        if (!(
          (p.sender === g.host_id && p.receiver === g.viewer_id) ||
          (p.sender === g.viewer_id && p.receiver === g.host_id)
        ))
          continue;
        rows.push({
          title: "تسویهٔ ثبت‌شده",
          date: p.date,
          currency: p.currency,
          total: p.amount,
          kind: "payment",
          viewer_paid: p.sender === g.viewer_id ? p.amount : 0,
          host_paid: p.sender === g.host_id ? p.amount : 0,
          viewer_share: null,
          host_share: null,
        });
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
      sections.push({
        title: g.name,
        kind: "group",
        balances: pairBalance(es, ps, g.host_id, g.viewer_id),
        rows,
        basis: "simplified-group",
      });
    }
  }
  const total = {};
  for (const section of sections)
    for (const [c, n] of Object.entries(section.balances))
      total[c] = (total[c] || 0) + n;
  return {
    host_name: host.name,
    viewer_name: viewerName,
    sections,
    balances: total,
    expires: link.expires,
    generated_at: new Date().toISOString(),
  };
}
export async function publicStatement(ctx) {
  const { path, method, env, one, fail, digest, json, limit, request } = ctx;
  if (!path.startsWith("/public/")) return null;
  if (method !== "GET") fail("این لینک فقط برای مشاهده است", 405);
  const raw = path.slice(8);
  if (!/^[a-f0-9]{64}$/.test(raw)) fail("لینک معتبر نیست", 404);
  await limit(
    env,
    "public-report:" + request.headers.get("CF-Connecting-IP"),
    120,
  );
  const link = await one(
    env,
    "SELECT * FROM statement_links WHERE token_hash=? AND revoked=0 AND expires>?",
    await digest(raw),
    Date.now(),
  );
  if (!link) fail("لینک منقضی یا باطل شده است", 404);
  return json(await reportData(ctx, link), 200, {
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
}
export async function statementRoute(ctx) {
  const {
    path,
    method,
    b,
    url,
    env,
    user,
    one,
    all,
    stmt,
    fail,
    uid,
    token,
    digest,
    json,
  } = ctx;
  if (!path.startsWith("/statements")) return null;
  if (path.startsWith("/statements/") && method === "DELETE") {
    const r = await stmt(
      env,
      "UPDATE statement_links SET revoked=1 WHERE id=? AND owner=?",
      path.split("/")[2],
      user.id,
    ).run();
    if (!r.meta.changes) fail("لینک پیدا نشد", 404);
    return json({ ok: true });
  }
  if (path !== "/statements" || !["GET", "POST"].includes(method))
    fail("مسیر نامعتبر است", 404);
  const scope = method === "GET" ? Object.fromEntries(url.searchParams) : b;
  if (!["person", "group"].includes(scope.scope)) fail("نوع گزارش نامعتبر است");
  const query = {
    scope: scope.scope,
    owner: user.id,
    account_id: scope.scope === "person" ? String(scope.account_id) : null,
    group_id: scope.scope === "group" ? String(scope.group_id) : null,
    participant_id:
      scope.scope === "group" ? String(scope.participant_id) : null,
  };
  // Validate the precise scope before minting or listing any bearer capability.
  await reportData(ctx, query);
  const args = [
    user.id,
    query.scope,
    query.account_id || "",
    query.group_id || "",
    query.participant_id || "",
  ];
  const where =
    "owner=? AND scope=? AND COALESCE(account_id,'')=? AND COALESCE(group_id,'')=? AND COALESCE(participant_id,'')=?";
  if (method === "GET")
    return json({
      links: await all(
        env,
        `SELECT id,expires,created_at FROM statement_links WHERE ${where} AND revoked=0 AND expires>? ORDER BY created_at DESC`,
        ...args,
        Date.now(),
      ),
    });
  const days = Number(b.days || 30);
  if (![7, 30, 90].includes(days)) fail("مدت اعتبار نامعتبر است");
  const id = uid(),
    raw = token(),
    expires = Date.now() + days * 86400000;
  await env.DB.batch([
    stmt(env, `UPDATE statement_links SET revoked=1 WHERE ${where}`, ...args),
    stmt(
      env,
      "INSERT INTO statement_links(id,token_hash,owner,scope,account_id,group_id,participant_id,expires) VALUES(?,?,?,?,?,?,?,?)",
      id,
      await digest(raw),
      user.id,
      query.scope,
      query.account_id,
      query.group_id,
      query.participant_id,
      expires,
    ),
  ]);
  return json({ id, token: raw, expires });
}
