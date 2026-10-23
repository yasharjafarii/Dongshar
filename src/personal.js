import { personalDelta, personalEntry } from "../public/personal-ledger.js";

export async function personalRoute(ctx) {
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
    str,
    currency,
    date,
    uid,
    token,
    json,
    limit,
  } = ctx;
  if (!path.startsWith("/people")) return null;
  const log = (id, message) =>
    stmt(
      env,
      "INSERT INTO personal_activity(id,account_id,user_id,message) VALUES(?,?,?,?)",
      uid(),
      id,
      user.id,
      message,
    );
  const getAccount = async (id) => {
    const a = await one(
      env,
      "SELECT a.*,u.name AS owner_name,p.name AS peer_name FROM personal_accounts a JOIN users u ON u.id=a.owner LEFT JOIN users p ON p.id=a.peer_user_id WHERE a.id=? AND (a.owner=? OR a.peer_user_id=?)",
      id,
      user.id,
      user.id,
    );
    if (!a) fail("حساب فردی پیدا نشد یا دسترسی ندارید", 404);
    return a;
  };
  const exposed = (a) => ({
    id: a.id,
    name: a.owner === user.id ? a.name : a.owner_name,
    currency: a.currency,
    owner: a.owner,
    is_owner: a.owner === user.id,
    shared: !!a.peer_user_id,
    counterparty_id: a.owner === user.id ? a.peer_user_id : a.owner,
    peer_name: a.owner === user.id ? a.peer_name : a.owner_name,
    personal_note: a.owner === user.id ? a.personal_note : "",
    archived: a.archived,
    created_at: a.created_at,
  });
  if (path === "/people" && method === "GET") {
    const accounts = await all(
      env,
      "SELECT a.*,u.name AS owner_name,p.name AS peer_name FROM personal_accounts a JOIN users u ON u.id=a.owner LEFT JOIN users p ON p.id=a.peer_user_id WHERE a.owner=? OR a.peer_user_id=? ORDER BY a.created_at DESC,a.id",
      user.id,
      user.id,
    );
    const totals = await all(
      env,
      "SELECT e.account_id,e.currency,SUM(e.owner_delta) AS balance,COUNT(*) AS count FROM personal_entries e JOIN personal_accounts a ON a.id=e.account_id WHERE e.deleted=0 AND (a.owner=? OR a.peer_user_id=?) GROUP BY e.account_id,e.currency",
      user.id,
      user.id,
    );
    return json({
      people: accounts.map((a) => ({
        ...exposed(a),
        balances: Object.fromEntries(
          totals
            .filter((t) => t.account_id === a.id)
            .map((t) => [
              t.currency,
              a.owner === user.id ? t.balance : -t.balance,
            ]),
        ),
        entry_count: totals
          .filter((t) => t.account_id === a.id)
          .reduce((s, t) => s + t.count, 0),
      })),
    });
  }
  if (path === "/people" && method === "POST") {
    const id = str(b.requestId, 36);
    if (!/^[a-f0-9-]{36}$/.test(id)) fail("شناسهٔ درخواست معتبر نیست");
    const prior = await one(
      env,
      "SELECT owner FROM personal_accounts WHERE id=?",
      id,
    );
    if (prior) {
      if (prior.owner !== user.id) fail("شناسه تکراری", 409);
      return json({ id });
    }
    await env.DB.batch([
      stmt(
        env,
        "INSERT INTO personal_accounts(id,owner,name,currency,personal_note) VALUES(?,?,?,?,?)",
        id,
        user.id,
        str(b.name, 60),
        currency(b.currency),
        typeof b.note === "string" ? b.note.slice(0, 1000) : "",
      ),
      log(id, "حساب فردی را ساخت"),
    ]);
    return json({ id });
  }
  if (path === "/people/join" && method === "POST") {
    await limit(env, "personal-join:" + user.id, 20);
    const invite = str(b.invite, 100),
      a = await one(
        env,
        "SELECT * FROM personal_accounts WHERE invite=? AND peer_user_id IS NULL AND archived=0",
        invite,
      );
    if (!a) fail("لینک اتصال معتبر نیست یا قبلاً استفاده شده است", 404);
    if (a.owner === user.id) fail("این حساب متعلق به خود شماست");
    const r = await env.DB.batch([
      stmt(
        env,
        "UPDATE personal_accounts SET peer_user_id=?,invite=NULL WHERE id=? AND invite=? AND peer_user_id IS NULL AND archived=0",
        user.id,
        a.id,
        invite,
      ),
      stmt(
        env,
        "INSERT INTO personal_activity(id,account_id,user_id,message) SELECT ?,?,?,? WHERE changes()>0",
        uid(),
        a.id,
        user.id,
        "به حساب مشترک پیوست",
      ),
    ]);
    if (!r[0].meta.changes) fail("لینک قبلاً استفاده یا باطل شده است", 409);
    return json({ id: a.id });
  }
  const match = path.match(/^\/people\/([^/]+)(?:\/(.*))?$/);
  if (!match) fail("مسیر پیدا نشد", 404);
  const [, id, sub = ""] = match,
    a = await getAccount(id),
    isOwner = a.owner === user.id;
  if (!sub && method === "GET") {
    const [entries, activity] = await Promise.all([
      all(
        env,
        "SELECT * FROM personal_entries WHERE account_id=? AND deleted=0 ORDER BY date DESC,created_at DESC,id",
        id,
      ),
      all(
        env,
        "SELECT a.*,u.name FROM personal_activity a JOIN users u ON u.id=a.user_id WHERE a.account_id=? ORDER BY a.created_at DESC,a.rowid DESC LIMIT 100",
        id,
      ),
    ]);
    const converted = entries.map((e) => personalEntry(e, isOwner));
    return json({
      account: exposed(a),
      entries: converted,
      activity,
      balances: converted.reduce(
        (t, e) => ((t[e.currency] = (t[e.currency] || 0) + e.my_delta), t),
        {},
      ),
    });
  }
  if (!sub && method === "PUT") {
    if (!isOwner)
      fail("فقط سازنده می‌تواند نام یا وضعیت این حساب را تغییر دهد", 403);
    await env.DB.batch([
      stmt(
        env,
        "UPDATE personal_accounts SET name=?,personal_note=?,archived=? WHERE id=?",
        str(b.name, 60),
        typeof b.note === "string" ? b.note.slice(0, 1000) : "",
        b.archived ? 1 : 0,
        id,
      ),
      log(
        id,
        b.archived ? "حساب فردی را بایگانی کرد" : "اطلاعات حساب را ویرایش کرد",
      ),
    ]);
    return json({ ok: true });
  }
  if (sub === "invite" && ["POST", "DELETE"].includes(method)) {
    if (!isOwner) fail("فقط سازندهٔ حساب می‌تواند لینک اتصال بسازد", 403);
    if (a.peer_user_id) fail("این حساب قبلاً به دوست شما متصل شده است");
    if (a.archived) fail("ابتدا حساب را از بایگانی خارج کنید");
    const invite = method === "POST" ? token() : null;
    await stmt(
      env,
      "UPDATE personal_accounts SET invite=? WHERE id=? AND peer_user_id IS NULL",
      invite,
      id,
    ).run();
    return json({ invite });
  }
  const em = sub.match(/^entries(?:\/([^/]+))?$/);
  if (em) {
    if (a.archived) fail("حساب بایگانی شده است؛ ابتدا آن را فعال کنید");
    const entryId = em[1];
    let e = entryId
      ? await one(
          env,
          "SELECT * FROM personal_entries WHERE id=? AND account_id=? AND deleted=0",
          entryId,
          id,
        )
      : null;
    if (entryId && !e) fail("تراکنش پیدا نشد", 404);
    if (
      entryId &&
      (await one(
        env,
        "SELECT 1 FROM bulk_item_closures WHERE scope='person' AND source_id=? UNION ALL SELECT 1 FROM batch_payments WHERE payment_id=?",
        entryId,
        entryId,
      ))
    )
      fail("ابتدا تسویهٔ کلی مربوط به این تراکنش را لغو کنید", 409);
    if (
      entryId &&
      (await one(
        env,
        "SELECT 1 FROM item_settlements WHERE (scope='person' AND source_id=?) OR payment_id=?",
        entryId,
        entryId,
      ))
    )
      fail(
        "این تراکنش تسویهٔ موردی دارد؛ ابتدا از فهرست موارد، تسویه را لغو کنید",
        409,
      );
    if (entryId && ["PUT", "DELETE"].includes(method) && e.creator !== user.id)
      fail("در حساب مشترک هر نفر فقط تراکنش‌های خودش را تغییر می‌دهد", 403);
    if (
      (!entryId && method !== "POST") ||
      (entryId && !["PUT", "DELETE"].includes(method))
    )
      fail("روش درخواست نامعتبر است", 405);
    if (method === "DELETE") {
      const version = Number(url.searchParams.get("version"));
      if (!Number.isSafeInteger(version)) fail("نسخهٔ تراکنش لازم است");
      const r = await env.DB.batch([
        stmt(
          env,
          "UPDATE personal_entries SET deleted=1,version=version+1 WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM item_settlements l WHERE (l.scope='person' AND l.source_id=personal_entries.id) OR l.payment_id=personal_entries.id) AND NOT EXISTS(SELECT 1 FROM bulk_item_closures c WHERE c.scope='person' AND c.source_id=personal_entries.id) AND NOT EXISTS(SELECT 1 FROM batch_payments z WHERE z.payment_id=personal_entries.id)",
          entryId,
          version,
        ),
        stmt(
          env,
          "INSERT INTO personal_activity(id,account_id,user_id,message) SELECT ?,?,?,? WHERE changes()>0",
          uid(),
          id,
          user.id,
          `تراکنش «${e.title}» را حذف کرد`,
        ),
      ]);
      if (!r[0].meta.changes) fail("تراکنش تغییر کرده؛ صفحه را تازه کنید", 409);
      return json({ ok: true });
    }
    if (!["self", "friend"].includes(b.paid_by))
      fail("پرداخت‌کننده را انتخاب کنید");
    const c = currency(b.currency),
      d = date(b.date),
      title = str(b.title),
      note = typeof b.note === "string" ? b.note.slice(0, 2000) : "";
    const payer =
      b.paid_by === "self"
        ? isOwner
          ? "owner"
          : "peer"
        : isOwner
          ? "peer"
          : "owner";
    if (
      b.kind === "expense" &&
      (!Number.isSafeInteger(b.my_share) ||
        b.my_share < 0 ||
        b.my_share > b.amount)
    )
      fail("سهم نامعتبر است");
    const ownShare =
      b.kind === "payment" ? 0 : isOwner ? b.my_share : b.amount - b.my_share;
    let delta;
    try {
      delta = personalDelta(b.kind, b.amount, payer, ownShare);
    } catch (error) {
      fail(error.message);
    }
    if (method === "POST") {
      const requestId = str(b.requestId, 36);
      if (!/^[a-f0-9-]{36}$/.test(requestId))
        fail("شناسهٔ درخواست نامعتبر است");
      const prior = await one(
        env,
        "SELECT creator,account_id FROM personal_entries WHERE id=?",
        requestId,
      );
      if (prior) {
        if (prior.creator !== user.id || prior.account_id !== id)
          fail("شناسه تکراری", 409);
        return json({ id: requestId });
      }
      await env.DB.batch([
        stmt(
          env,
          "INSERT INTO personal_entries(id,account_id,creator,kind,title,amount,currency,payer,owner_share,owner_delta,date,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          requestId,
          id,
          user.id,
          b.kind,
          title,
          b.amount,
          c,
          payer,
          ownShare,
          delta,
          d,
          note,
        ),
        log(id, `تراکنش «${title}» را ثبت کرد`),
      ]);
      return json({ id: requestId });
    }
    if (!Number.isSafeInteger(b.version)) fail("نسخهٔ تراکنش لازم است");
    const r = await env.DB.batch([
      stmt(
        env,
        "UPDATE personal_entries SET kind=?,title=?,amount=?,currency=?,payer=?,owner_share=?,owner_delta=?,date=?,note=?,version=version+1 WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM item_settlements l WHERE (l.scope='person' AND l.source_id=personal_entries.id) OR l.payment_id=personal_entries.id)",
        b.kind,
        title,
        b.amount,
        c,
        payer,
        ownShare,
        delta,
        d,
        note,
        entryId,
        b.version,
      ),
      stmt(
        env,
        "INSERT INTO personal_activity(id,account_id,user_id,message) SELECT ?,?,?,? WHERE changes()>0",
        uid(),
        id,
        user.id,
        `تراکنش «${title}» را ویرایش کرد`,
      ),
    ]);
    if (!r[0].meta.changes) fail("تراکنش تغییر کرده؛ صفحه را تازه کنید", 409);
    return json({ ok: true });
  }
  fail("مسیر پیدا نشد", 404);
}
