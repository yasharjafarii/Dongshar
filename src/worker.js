import { selectedItemsRoute } from "./selected-items.js";
import { emailAuth, mailReady } from "./email-auth.js";
import { settleAllRoute } from "./settle-all.js";
import { itemsRoute } from "./items.js";
import { overview } from "./overview.js";
import { removeMember } from "./remove-member.js";
import { claimParticipant, addGroupFriend } from "./participants.js";
import { publicStatement, statementRoute } from "./statements.js";
import { personalRoute } from "./personal.js";
import { currencies, split, nextDate } from "../public/ledger.js";

const uid = () => crypto.randomUUID();
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const hex = (b) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const digest = async (s) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
async function passwordHash(p, s) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(s),
        iterations: 100000,
        hash: "SHA-256",
      },
      k,
      256,
    ),
  );
}
function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
function str(x, max = 120) {
  if (typeof x !== "string" || !x.trim() || x.trim().length > max)
    fail("متن خالی یا طولانی است");
  return x.trim();
}
function date(x) {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString().slice(0, 10) !== x
  )
    fail("تاریخ نامعتبر است");
  return x;
}
function currency(x) {
  if (!currencies[x]) fail("واحد پول نامعتبر است");
  return x;
}
function amount(x) {
  if (!Number.isSafeInteger(x) || x <= 0 || x > 1e12) fail("مبلغ نامعتبر است");
  return x;
}
function json(x, status = 200, headers = {}) {
  return new Response(JSON.stringify(x), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const all = async (env, sql, ...args) =>
  (await stmt(env, sql, ...args).all()).results;
const one = (env, sql, ...args) => stmt(env, sql, ...args).first();
const audit = (env, g, u, m) =>
  stmt(
    env,
    "INSERT INTO activity(id,group_id,user_id,message) VALUES(?,?,?,?)",
    uid(),
    g,
    u,
    m,
  );
async function member(env, g, u) {
  const row = await one(
    env,
    "SELECT g.*,(SELECT p.id FROM group_participants p WHERE p.group_id=g.id AND p.user_id=m.user_id) AS my_member_id FROM groups g JOIN members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=?",
    g,
    u,
  );
  if (!row) fail("گروه پیدا نشد یا دسترسی ندارید", 404);
  return row;
}
async function writable(env, g, u) {
  const group = await member(env, g, u);
  if (group.archived) fail("گروه بایگانی شده است");
  return group;
}
async function limit(env, key, max = 20) {
  const now = Math.floor(Date.now() / 1000),
    bucket = Math.floor(now / 900),
    k = await digest(key + bucket);
  const r = await one(
    env,
    "INSERT INTO auth_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    k,
    now + 1800,
  );
  if (r.count > max)
    fail("تلاش‌های زیادی انجام شده؛ ۱۵ دقیقه دیگر امتحان کنید", 429);
}
async function session(env, user, request) {
  const raw = token();
  await stmt(
    env,
    "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
    await digest(raw),
    user.id,
    Date.now() + 30 * 86400000,
  ).run();
  return json(
    { user: { id: user.id, name: user.name, email: user.email } },
    200,
    { "Set-Cookie": cookie(raw, request) },
  );
}
function cookie(raw, request) {
  return `dong_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${raw ? 2592000 : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function expenseData(env, g, b, memberIds) {
  const ids =
    memberIds ||
    new Set(
      (
        await all(
          env,
          "SELECT id AS user_id FROM group_participants WHERE group_id=? AND removed=0",
          g,
        )
      ).map((x) => x.user_id),
    );
  const total = amount(b.amount),
    c = currency(b.currency);
  if (
    !Array.isArray(b.payers) ||
    b.payers.length > 100 ||
    !b.payers.length ||
    new Set(b.payers.map((x) => x.id)).size !== b.payers.length ||
    b.payers.some(
      (x) => !ids.has(x.id) || !Number.isSafeInteger(x.value) || x.value < 0,
    ) ||
    b.payers.reduce((s, x) => s + x.value, 0) !== total
  )
    fail("جمع پرداخت‌ها باید برابر هزینه باشد");
  let allocations;
  try {
    allocations = split(total, b.mode, b.entries);
  } catch (e) {
    fail(e.message);
  }
  if (allocations.some((x) => !ids.has(x.id)))
    fail("فرد انتخاب‌شده عضو گروه نیست");
  let receipt = b.receipt || null;
  if (
    receipt &&
    (typeof receipt !== "string" ||
      receipt.length > 350000 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(receipt))
  )
    fail("تصویر رسید باید PNG، JPEG یا WebP و کوچک‌تر از ۲۵۰ کیلوبایت باشد");
  return {
    title: str(b.title),
    amount: total,
    currency: c,
    date: date(b.date),
    category: str(b.category, 40),
    note: typeof b.note === "string" ? b.note.slice(0, 2000) : "",
    mode: b.mode,
    allocations,
    payers: b.payers,
    receipt,
  };
}
function insertExpense(env, id, g, u, e) {
  return stmt(
    env,
    "INSERT INTO expenses(id,group_id,creator,title,amount,currency,date,category,note,mode,allocations,payers,receipt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id,
    g,
    u,
    e.title,
    e.amount,
    e.currency,
    e.date,
    e.category,
    e.note,
    e.mode,
    JSON.stringify(e.allocations),
    JSON.stringify(e.payers),
    e.receipt,
  );
}
function decode(e) {
  return {
    ...e,
    allocations: JSON.parse(e.allocations),
    payers: JSON.parse(e.payers),
  };
}

async function api(request, env) {
  const url = new URL(request.url),
    path = url.pathname.slice(4),
    method = request.method;
  if (!["GET", "POST", "PUT", "DELETE"].includes(method))
    fail("روش درخواست نامعتبر است", 405);
  if (method !== "GET" && request.headers.get("Origin") !== url.origin)
    fail("مبدأ درخواست معتبر نیست", 403);
  let b = {};
  if (["POST", "PUT"].includes(method)) {
    if (!request.headers.get("Content-Type")?.includes("application/json"))
      fail("JSON لازم است", 415);
    const raw = await request.text();
    if (raw.length > 400000) fail("درخواست بیش از حد بزرگ است", 413);
    try {
      b = JSON.parse(raw);
    } catch {
      fail("JSON نامعتبر است");
    }
    if (!b || typeof b !== "object" || Array.isArray(b))
      fail("درخواست نامعتبر است");
  }
  const emailContext = {
    path,
    method,
    b,
    env,
    one,
    all,
    stmt,
    fail,
    token,
    digest,
    passwordHash,
    json,
    limit,
    request,
    cookie,
  };
  const emailResponse = await emailAuth(emailContext);
  if (emailResponse) return emailResponse;
  if (
    path === "/auth/register" ||
    path === "/auth/login" ||
    path === "/auth/recover"
  ) {
    if (method !== "POST") fail("روش نامعتبر", 405);
    await limit(env, "ip:" + request.headers.get("CF-Connecting-IP"), 30);
    const email = str(b.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("ایمیل نامعتبر است");
    await limit(env, "email:" + email, 15);
    if (typeof b.password !== "string" || b.password.length > 200)
      fail("رمز عبور نامعتبر است");
    const password = b.password;
    if (password.length < 10) fail("رمز عبور باید حداقل ۱۰ نویسه باشد");
    if (path === "/auth/register") {
      const name = str(b.name, 60),
        id = uid(),
        salt = token(),
        recovery = token();
      const hash = await passwordHash(password, salt);
      try {
        await stmt(
          env,
          "INSERT INTO users(id,name,email,password,salt,recovery) VALUES(?,?,?,?,?,?)",
          id,
          name,
          email,
          hash,
          salt,
          await digest(recovery),
        ).run();
      } catch (e) {
        if (String(e).includes("UNIQUE"))
          fail("ثبت‌نام با این ایمیل امکان‌پذیر نیست");
        throw e;
      }
      let verification = mailReady(env) ? "pending" : "disabled";
      if (mailReady(env))
        try {
          await emailAuth({
            ...emailContext,
            path: "/auth/send-verification",
            user: { id, name, email },
          });
        } catch {
          verification = "failed";
        }
      const res = await session(env, { id, name, email }, request);
      const data = await res.json();
      return json({ ...data, recovery, verification }, 200, {
        "Set-Cookie": res.headers.get("Set-Cookie"),
      });
    }
    const user = await one(env, "SELECT * FROM users WHERE email=?", email);
    if (path === "/auth/recover") {
      if (!user || (await digest(String(b.recovery))) !== user.recovery)
        fail("ایمیل یا کلید بازیابی نادرست است", 401);
      const salt = token(),
        recovery = token();
      await env.DB.batch([
        stmt(
          env,
          "UPDATE users SET password=?,salt=?,recovery=? WHERE id=?",
          await passwordHash(password, salt),
          salt,
          await digest(recovery),
          user.id,
        ),
        stmt(env, "DELETE FROM sessions WHERE user_id=?", user.id),
      ]);
      return json({ recovery });
    }
    const hash = await passwordHash(
      password,
      user?.salt || "invalid-user-fixed-salt",
    );
    if (!user || hash !== user.password)
      fail("ایمیل یا رمز عبور نادرست است", 401);
    return session(env, user, request);
  }
  const publicResponse = await publicStatement({
    path,
    method,
    env,
    one,
    all,
    fail,
    digest,
    json,
    limit,
    request,
  });
  if (publicResponse) return publicResponse;
  const raw = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)dong_session=([^;]+)/)?.[1];
  const user = raw
    ? await one(
        env,
        "SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        await digest(raw),
        Date.now(),
      )
    : null;
  if (!user) fail("برای ادامه وارد حساب شوید", 401);
  if (path === "/auth/logout" && method === "POST") {
    await stmt(
      env,
      "DELETE FROM sessions WHERE token=?",
      await digest(raw),
    ).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", request) });
  }
  const accountResponse = await emailAuth({ ...emailContext, user });
  if (accountResponse) return accountResponse;
  const bulkResponse = await settleAllRoute({
    path,
    method,
    url,
    b,
    env,
    user,
    one,
    all,
    stmt,
    fail,
    date,
    json,
    uid,
    digest,
  });
  if (bulkResponse) return bulkResponse;
  const statementResponse = await statementRoute({
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
  });
  if (statementResponse) return statementResponse;
  if (path === "/overview" && method === "GET")
    return json(await overview({ env, user, all }));
  const selectedResponse = await selectedItemsRoute({
    path,
    method,
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
  });
  if (selectedResponse) return selectedResponse;
  const itemResponse = await itemsRoute({
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
  });
  if (itemResponse) return itemResponse;
  const personalResponse = await personalRoute({
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
  });
  if (personalResponse) return personalResponse;
  if (path === "/me" && method === "GET")
    return json({
      user,
      groups: await all(
        env,
        "SELECT g.*,(SELECT COUNT(*) FROM group_participants WHERE group_id=g.id AND removed=0) AS member_count FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at DESC",
        user.id,
      ),
    });
  if (path === "/profile" && method === "PUT") {
    await stmt(
      env,
      "UPDATE users SET name=? WHERE id=?",
      str(b.name, 60),
      user.id,
    ).run();
    return json({ ok: true });
  }
  if (path === "/groups" && method === "POST") {
    const id = uid();
    await env.DB.batch([
      stmt(
        env,
        "INSERT INTO groups(id,name,emoji,currency,owner,invite) VALUES(?,?,?,?,?,?)",
        id,
        str(b.name, 80),
        str(b.emoji || "✈️", 16),
        currency(b.currency),
        user.id,
        token(),
      ),
      stmt(
        env,
        "INSERT INTO members(group_id,user_id) VALUES(?,?)",
        id,
        user.id,
      ),
      audit(env, id, user.id, "گروه را ساخت"),
    ]);
    return json({ id });
  }
  if (path === "/join" && method === "POST") {
    await limit(env, "join:" + user.id, 30);
    const g = await one(
      env,
      "SELECT * FROM groups WHERE invite=? AND archived=0",
      str(b.invite, 100),
    );
    if (!g) fail("دعوت‌نامه معتبر نیست", 404);
    await claimParticipant(env, g.id, user.id);
    await stmt(
      env,
      "UPDATE group_participants SET removed=0 WHERE group_id=? AND user_id=?",
      g.id,
      user.id,
    ).run();
    if (
      !(await one(
        env,
        "SELECT id FROM group_participants WHERE group_id=? AND user_id=?",
        g.id,
        user.id,
      )) &&
      (
        await one(
          env,
          "SELECT COUNT(*) AS n FROM group_participants WHERE group_id=?",
          g.id,
        )
      ).n >= 100
    )
      fail("ظرفیت گروه تکمیل است");
    await stmt(
      env,
      "INSERT OR IGNORE INTO members(group_id,user_id) VALUES(?,?)",
      g.id,
      user.id,
    ).run();
    return json({ id: g.id });
  }
  const match = path.match(/^\/groups\/([^/]+)(?:\/(.*))?$/);
  if (!match) fail("مسیر پیدا نشد", 404);
  const [, g, sub = ""] = match,
    group = await member(env, g, user.id);
  if (sub === "members" && method === "POST")
    return addGroupFriend({
      env,
      g,
      user,
      group,
      b,
      one,
      stmt,
      fail,
      uid,
      audit,
      json,
    });
  if (sub.startsWith("members/") && method === "DELETE")
    return removeMember({
      env,
      g,
      group,
      user,
      id: decodeURIComponent(sub.slice(8)),
      one,
      all,
      stmt,
      fail,
      audit,
      json,
    });
  if (!sub && method === "GET") {
    const [members, expenses, settlements, activity, recurring] =
      await Promise.all([
        all(
          env,
          "SELECT p.id,COALESCE(u.name,p.name) AS name,p.user_id,p.contact_id,p.removed FROM group_participants p LEFT JOIN users u ON u.id=p.user_id WHERE p.group_id=? ORDER BY p.rowid",
          g,
        ),
        all(
          env,
          "SELECT id,group_id,creator,title,amount,currency,date,category,note,mode,allocations,payers,version,deleted,created_at,(receipt IS NOT NULL) AS has_receipt FROM expenses WHERE group_id=? AND deleted=0 ORDER BY date DESC,created_at DESC",
          g,
        ),
        all(
          env,
          "SELECT * FROM settlements WHERE group_id=? AND deleted=0 ORDER BY date DESC",
          g,
        ),
        all(
          env,
          "SELECT a.*,u.name FROM activity a JOIN users u ON u.id=a.user_id WHERE a.group_id=? ORDER BY a.created_at DESC LIMIT 100",
          g,
        ),
        all(
          env,
          "SELECT id,template,cadence,next_date,active FROM recurring WHERE group_id=? AND active=1",
          g,
        ),
      ]);
    return json({
      group,
      members,
      expenses: expenses.map(decode),
      settlements,
      activity,
      recurring: recurring.map((x) => ({
        ...x,
        template: JSON.parse(x.template),
      })),
    });
  }
  if (!sub && method === "PUT") {
    if (group.owner !== user.id) fail("فقط سازندهٔ گروه دسترسی دارد", 403);
    await env.DB.batch([
      stmt(
        env,
        "UPDATE groups SET name=?,archived=? WHERE id=?",
        str(b.name, 80),
        b.archived ? 1 : 0,
        g,
      ),
      audit(
        env,
        g,
        user.id,
        b.archived ? "گروه را بایگانی کرد" : "تنظیمات گروه را تغییر داد",
      ),
    ]);
    return json({ ok: true });
  }
  if (sub === "invite" && method === "POST") {
    if (group.owner !== user.id) fail("فقط سازندهٔ گروه دسترسی دارد", 403);
    const invite = token();
    await stmt(env, "UPDATE groups SET invite=? WHERE id=?", invite, g).run();
    return json({ invite });
  }
  if (sub === "defaults" && method === "PUT") {
    await writable(env, g, user.id);
    try {
      split(10000, b.mode, b.entries);
    } catch (e) {
      fail(e.message);
    }
    const ids = new Set(
      (
        await all(
          env,
          "SELECT id AS user_id FROM group_participants WHERE group_id=? AND removed=0",
          g,
        )
      ).map((x) => x.user_id),
    );
    if (b.entries.some((x) => !ids.has(x.id))) fail("عضو نامعتبر");
    await stmt(
      env,
      "UPDATE groups SET defaults=? WHERE id=?",
      JSON.stringify({ mode: b.mode, entries: b.entries }),
      g,
    ).run();
    return json({ ok: true });
  }
  if (sub === "import" && method === "POST") {
    await writable(env, g, user.id);
    const key = str(b.key, 64);
    if (!/^[a-f0-9-]{36}$/.test(key)) fail("کلید ورود فایل نامعتبر است");
    const prior = await one(env, "SELECT * FROM imports WHERE id=?", key);
    if (prior) {
      if (prior.group_id !== g || prior.user_id !== user.id)
        fail("کلید تکراری", 409);
      return json({ count: prior.count });
    }
    if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 20)
      fail("هر بار ۱ تا ۲۰ ردیف وارد کنید");
    const ids = new Set(
        (
          await all(
            env,
            "SELECT id AS user_id FROM group_participants WHERE group_id=? AND removed=0",
            g,
          )
        ).map((x) => x.user_id),
      ),
      batch = [];
    for (const row of b.rows) {
      const e = await expenseData(env, g, { ...row, receipt: null }, ids);
      batch.push(insertExpense(env, uid(), g, user.id, e));
    }
    batch.unshift(
      stmt(
        env,
        "INSERT INTO imports(id,group_id,user_id,count) VALUES(?,?,?,?)",
        key,
        g,
        user.id,
        b.rows.length,
      ),
    );
    batch.push(
      audit(env, g, user.id, b.rows.length + " هزینه را از فایل وارد کرد"),
    );
    await env.DB.batch(batch);
    return json({ count: b.rows.length });
  }
  if (sub === "expenses" && method === "POST") {
    await writable(env, g, user.id);
    const e = await expenseData(env, g, b),
      id = b.requestId || uid();
    if (!/^[a-f0-9-]{36}$/.test(id)) fail("شناسهٔ درخواست نامعتبر است");
    const previous = await one(
      env,
      "SELECT group_id,creator FROM expenses WHERE id=?",
      id,
    );
    if (previous) {
      if (previous.group_id !== g || previous.creator !== user.id)
        fail("شناسه تکراری", 409);
      return json({ id });
    }
    const batch = [
      insertExpense(env, id, g, user.id, e),
      audit(env, g, user.id, `هزینهٔ «${e.title}» را ثبت کرد`),
    ];
    if (b.cadence) {
      if (!["weekly", "monthly"].includes(b.cadence)) fail("دوره نامعتبر");
      batch.push(
        stmt(
          env,
          "INSERT INTO recurring(id,group_id,creator,template,cadence,next_date,calendar) VALUES(?,?,?,?,?,?,'persian')",
          uid(),
          g,
          user.id,
          JSON.stringify({ ...e, receipt: null }),
          b.cadence,
          nextDate(e.date, b.cadence, "persian"),
        ),
      );
    }
    await env.DB.batch(batch);
    return json({ id });
  }
  const em = sub.match(/^expenses\/([^/]+)(?:\/(comments|receipt))?$/);
  if (em) {
    const [, id, action] = em,
      e = await one(
        env,
        "SELECT * FROM expenses WHERE id=? AND group_id=? AND deleted=0",
        id,
        g,
      );
    if (!e) fail("هزینه پیدا نشد", 404);
    if (action === "receipt" && method === "GET")
      return json({ receipt: e.receipt });
    if (action === "comments" && method === "GET")
      return json(
        await all(
          env,
          "SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE expense_id=? ORDER BY c.created_at",
          id,
        ),
      );
    if (action === "comments" && method === "POST") {
      await writable(env, g, user.id);
      await stmt(
        env,
        "INSERT INTO comments(id,expense_id,user_id,body) VALUES(?,?,?,?)",
        uid(),
        id,
        user.id,
        str(b.body, 1000),
      ).run();
      return json({ ok: true });
    }
    if (!action && ["PUT", "DELETE"].includes(method)) {
      if (
        await one(
          env,
          "SELECT 1 FROM bulk_item_closures WHERE scope='group' AND source_id=?",
          id,
        )
      )
        fail("ابتدا تسویهٔ کلی مربوط به این هزینه را لغو کنید", 409);
      if (
        await one(
          env,
          "SELECT 1 FROM item_settlements WHERE scope='group' AND source_id=?",
          id,
        )
      )
        fail(
          "این هزینه تسویهٔ موردی دارد؛ ابتدا تسویهٔ موردی را لغو کنید",
          409,
        );
      await writable(env, g, user.id);
      if (e.creator !== user.id && group.owner !== user.id)
        fail("فقط ثبت‌کننده یا مدیر گروه می‌تواند هزینه را تغییر دهد", 403);
      const version =
        method === "DELETE"
          ? Number(url.searchParams.get("version"))
          : b.version;
      if (!Number.isSafeInteger(version)) fail("نسخهٔ هزینه لازم است");
      let update;
      if (method === "DELETE")
        update = stmt(
          env,
          "UPDATE expenses SET deleted=1,version=version+1 WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM item_settlements l WHERE l.scope='group' AND l.source_id=expenses.id) AND NOT EXISTS(SELECT 1 FROM bulk_item_closures c WHERE c.scope='group' AND c.source_id=expenses.id)",
          id,
          version,
        );
      else {
        const x = await expenseData(env, g, {
          ...b,
          receipt: b.receipt === undefined ? e.receipt : b.receipt,
        });
        update = stmt(
          env,
          "UPDATE expenses SET title=?,amount=?,currency=?,date=?,category=?,note=?,mode=?,allocations=?,payers=?,receipt=?,version=version+1 WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM item_settlements l WHERE l.scope='group' AND l.source_id=expenses.id)",
          x.title,
          x.amount,
          x.currency,
          x.date,
          x.category,
          x.note,
          x.mode,
          JSON.stringify(x.allocations),
          JSON.stringify(x.payers),
          x.receipt,
          id,
          version,
        );
      }
      const results = await env.DB.batch([
        update,
        stmt(
          env,
          "INSERT INTO activity(id,group_id,user_id,message) SELECT ?,?,?,? WHERE changes()>0",
          uid(),
          g,
          user.id,
          `هزینهٔ «${e.title}» را ${method === "DELETE" ? "حذف" : "ویرایش"} کرد`,
        ),
      ]);
      if (!results[0].meta.changes)
        fail("این هزینه تغییر کرده است؛ صفحه را تازه کنید", 409);
      return json({ ok: true });
    }
  }
  if (sub === "settlements" && method === "POST") {
    await writable(env, g, user.id);
    const ids = new Set(
      (
        await all(
          env,
          "SELECT id AS user_id FROM group_participants WHERE group_id=? AND removed=0",
          g,
        )
      ).map((x) => x.user_id),
    );
    if (!ids.has(b.sender) || !ids.has(b.receiver) || b.sender === b.receiver)
      fail("دو عضو متفاوت انتخاب کنید");
    if (
      group.my_member_id !== b.sender &&
      group.my_member_id !== b.receiver &&
      user.id !== group.owner
    )
      fail("فقط طرفین پرداخت یا مدیر گروه اجازه دارند", 403);
    const id = b.requestId || uid();
    if (!/^[a-f0-9-]{36}$/.test(id)) fail("شناسهٔ درخواست نامعتبر است");
    const previous = await one(
      env,
      "SELECT group_id,creator FROM settlements WHERE id=?",
      id,
    );
    if (previous) {
      if (previous.group_id !== g || previous.creator !== user.id)
        fail("شناسه تکراری", 409);
      return json({ ok: true });
    }
    await env.DB.batch([
      stmt(
        env,
        "INSERT INTO settlements(id,group_id,sender,receiver,amount,currency,date,creator) VALUES(?,?,?,?,?,?,?,?)",
        id,
        g,
        b.sender,
        b.receiver,
        amount(b.amount),
        currency(b.currency),
        date(b.date),
        user.id,
      ),
      audit(env, g, user.id, "یک تسویه را ثبت کرد"),
    ]);
    return json({ ok: true });
  }
  if (sub.startsWith("settlements/") && method === "DELETE") {
    await writable(env, g, user.id);
    const s = await one(
      env,
      "SELECT * FROM settlements WHERE id=? AND group_id=? AND deleted=0",
      sub.split("/")[1],
      g,
    );
    if (!s) fail("تسویه پیدا نشد", 404);
    if (await one(env, "SELECT 1 FROM batch_payments WHERE payment_id=?", s.id))
      fail(
        "این پرداخت بخشی از تسویهٔ کلی است؛ همان تسویهٔ کلی را لغو کنید",
        409,
      );
    if (
      await one(env, "SELECT 1 FROM item_settlements WHERE payment_id=?", s.id)
    )
      fail(
        "این پرداخت به یک هزینه وصل است؛ از فهرست تسویهٔ موردی آن را لغو کنید",
        409,
      );
    if (s.creator !== user.id && group.owner !== user.id)
      fail("دسترسی ندارید", 403);
    await env.DB.batch([
      stmt(env, "UPDATE settlements SET deleted=1 WHERE id=?", s.id),
      audit(env, g, user.id, "یک تسویه را لغو کرد"),
    ]);
    return json({ ok: true });
  }
  if (sub.startsWith("recurring/") && method === "DELETE") {
    const r = await one(
      env,
      "SELECT * FROM recurring WHERE id=? AND group_id=?",
      sub.split("/")[1],
      g,
    );
    if (!r) fail("برنامه پیدا نشد", 404);
    if (r.creator !== user.id && group.owner !== user.id)
      fail("دسترسی ندارید", 403);
    await env.DB.batch([
      stmt(env, "UPDATE recurring SET active=0 WHERE id=?", r.id),
      audit(env, g, user.id, "تکرار خودکار هزینه را متوقف کرد"),
    ]);
    return json({ ok: true });
  }
  fail("مسیر پیدا نشد", 404);
}

export async function scheduled(env, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const rows = await all(
    env,
    "SELECT r.* FROM recurring r JOIN groups g ON g.id=r.group_id WHERE r.active=1 AND r.next_date<=? AND g.archived=0 ORDER BY r.next_date LIMIT 50",
    today,
  );
  for (const r of rows) {
    const e = JSON.parse(r.template),
      id = `${r.id}:${r.next_date}`,
      next = nextDate(r.next_date, r.cadence, r.calendar);
    await env.DB.batch([
      stmt(
        env,
        "INSERT OR IGNORE INTO expenses(id,group_id,creator,title,amount,currency,date,category,note,mode,allocations,payers) SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM recurring WHERE id=? AND active=1 AND next_date=?",
        id,
        r.group_id,
        r.creator,
        e.title,
        e.amount,
        e.currency,
        r.next_date,
        e.category,
        e.note,
        e.mode,
        JSON.stringify(e.allocations),
        JSON.stringify(e.payers),
        r.id,
        r.next_date,
      ),
      stmt(
        env,
        "INSERT INTO activity(id,group_id,user_id,message) SELECT ?,?,?,? WHERE changes()>0",
        uid(),
        r.group_id,
        r.creator,
        `هزینهٔ تکرارشوندهٔ «${e.title}» ثبت شد`,
      ),
      stmt(
        env,
        "UPDATE recurring SET next_date=? WHERE id=? AND next_date=? AND active=1",
        next,
        r.id,
        r.next_date,
      ),
    ]);
  }
  await env.DB.batch([
    stmt(env, "DELETE FROM sessions WHERE expires<?", Date.now()),
    stmt(env, "DELETE FROM email_tokens WHERE expires<?", Date.now()),
    stmt(
      env,
      "DELETE FROM auth_limits WHERE expires<?",
      Math.floor(Date.now() / 1000),
    ),
  ]);
}
export default {
  async fetch(request, env) {
    let response;
    try {
      response = new URL(request.url).pathname.startsWith("/api/")
        ? await api(request, env)
        : await env.ASSETS.fetch(request);
    } catch (e) {
      if (!e.status) console.error(e);
      response = json(
        { error: e.status ? e.message : "خطای سرور؛ دوباره تلاش کنید" },
        e.status || 500,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    if (!headers.has("Referrer-Policy"))
      headers.set("Referrer-Policy", "same-origin");
    if (new URL(request.url).pathname.startsWith("/api/public/")) {
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event, env) {
    await scheduled(env);
  },
};
