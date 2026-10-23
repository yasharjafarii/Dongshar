export function mailReady(env) {
  try {
    const u = new URL(env.APP_URL);
    return (
      !!env.RESEND_API_KEY &&
      !!env.EMAIL_FROM &&
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === "/"
    );
  } catch {
    return false;
  }
}
async function send(env, to, subject, text) {
  const sender = env.MAILER ? env.MAILER.fetch.bind(env.MAILER) : fetch;
  const r = await sender("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error("EMAIL_DELIVERY_FAILED");
}
async function notify(env, email) {
  if (!mailReady(env)) return;
  try {
    await send(
      env,
      email,
      "رمز عبور دنگشار تغییر کرد",
      "رمز عبور حساب شما در دنگشار تغییر کرد و تمام نشست‌های قبلی بسته شدند. اگر این تغییر را انجام نداده‌اید، از بازیابی رمز در " +
        env.APP_URL +
        " استفاده کنید.",
    );
  } catch {
    console.error("Password notification delivery failed");
  }
}
export async function emailAuth(ctx) {
  const {
    path,
    method,
    b,
    env,
    one,
    stmt,
    fail,
    token,
    digest,
    passwordHash,
    json,
    limit,
    request,
    user,
    cookie,
  } = ctx;
  if (path === "/auth/email-config" && method === "GET")
    return json({ enabled: mailReady(env) });
  const publicPaths = [
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
  ];
  const privatePaths = [
    "/auth/security",
    "/auth/send-verification",
    "/auth/change-password",
    "/auth/logout-all",
  ];
  if (!publicPaths.includes(path) && !privatePaths.includes(path)) return null;
  if (privatePaths.includes(path) && !user) return null;
  if (path === "/auth/security" && method === "GET") {
    const u = await one(
      env,
      "SELECT email_verified_at FROM users WHERE id=?",
      user.id,
    );
    return json({
      email: user.email,
      verified: !!u.email_verified_at,
      email_enabled: mailReady(env),
    });
  }
  if (method !== "POST") fail("روش نامعتبر", 405);
  await limit(env, "email-ip:" + request.headers.get("CF-Connecting-IP"), 25);
  if (user) await limit(env, "security:" + user.id, 15);
  if (path === "/auth/logout-all") {
    await stmt(env, "DELETE FROM sessions WHERE user_id=?", user.id).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", request) });
  }
  if (path === "/auth/forgot-password" || path === "/auth/send-verification") {
    if (!mailReady(env))
      fail(
        "ارسال ایمیل هنوز توسط مدیر سایت راه‌اندازی نشده است؛ از کلید بازیابی استفاده کنید",
        503,
      );
    const email =
      path === "/auth/send-verification"
        ? user.email
        : String(b.email || "")
            .trim()
            .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      fail("ایمیل نامعتبر است");
    await limit(env, "mail-address:" + email, 4);
    const u = await one(env, "SELECT * FROM users WHERE email=?", email);
    if (u) {
      const raw = token(),
        purpose = path === "/auth/forgot-password" ? "reset" : "verify",
        hash = await digest(raw);
      await stmt(
        env,
        "INSERT INTO email_tokens(token_hash,user_id,purpose,password_marker,expires) VALUES(?,?,?,?,?)",
        hash,
        u.id,
        purpose,
        u.password,
        Date.now() + 30 * 60000,
      ).run();
      try {
        await send(
          env,
          email,
          purpose === "reset"
            ? "بازیابی رمز عبور دنگشار"
            : "تأیید ایمیل دنگشار",
          `برای ${purpose === "reset" ? "انتخاب رمز جدید" : "تأیید ایمیل"} لینک زیر را باز کنید:\n${new URL(env.APP_URL).origin}/#${purpose}=${raw}\nاین لینک یک‌بارمصرف است و ۳۰ دقیقه اعتبار دارد. اگر شما درخواست نداده‌اید این ایمیل را نادیده بگیرید.`,
        );
      } catch {
        await stmt(
          env,
          "DELETE FROM email_tokens WHERE token_hash=?",
          hash,
        ).run();
        console.error("Account email delivery failed");
        if (path === "/auth/send-verification")
          fail("ارسال ایمیل انجام نشد؛ بعداً دوباره تلاش کنید", 503);
      }
    }
    return json({
      ok: true,
      message:
        "درخواست ثبت شد. اگر حسابی با این ایمیل وجود داشته باشد، لینک را در صندوق ورودی یا پوشهٔ هرزنامه بررسی کنید.",
    });
  }
  let u, link;
  if (path === "/auth/change-password") {
    u = await one(env, "SELECT * FROM users WHERE id=?", user.id);
    if (
      typeof b.current_password !== "string" ||
      b.current_password.length > 200 ||
      (await passwordHash(b.current_password, u.salt)) !== u.password
    )
      fail("رمز فعلی نادرست است", 401);
  } else {
    if (!/^[a-f0-9]{64}$/.test(String(b.token)))
      fail("لینک معتبر نیست یا منقضی شده است", 400);
    link = await one(
      env,
      "SELECT t.*,u.password,u.email FROM email_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=? AND expires>? AND used IS NULL",
      await digest(b.token),
      Date.now(),
    );
    if (
      !link ||
      link.password !== link.password_marker ||
      link.purpose !== (path === "/auth/reset-password" ? "reset" : "verify")
    )
      fail("لینک معتبر نیست یا منقضی شده است", 400);
    u = { id: link.user_id, email: link.email, password: link.password };
  }
  if (path === "/auth/verify-email") {
    const claim = token();
    const rs = await env.DB.batch([
      stmt(
        env,
        "UPDATE email_tokens SET used=? WHERE token_hash=? AND used IS NULL AND expires>? AND password_marker=(SELECT password FROM users WHERE id=user_id)",
        claim,
        link.token_hash,
        Date.now(),
      ),
      stmt(
        env,
        "UPDATE users SET email_verified_at=? WHERE id=? AND EXISTS(SELECT 1 FROM email_tokens WHERE token_hash=? AND used=?)",
        Date.now(),
        u.id,
        link.token_hash,
        claim,
      ),
    ]);
    if (!rs[0].meta.changes) fail("لینک قبلاً مصرف شده است", 400);
    return json({ ok: true });
  }
  if (
    typeof b.password !== "string" ||
    b.password.length < 10 ||
    b.password.length > 200
  )
    fail("رمز جدید باید بین ۱۰ تا ۲۰۰ نویسه باشد");
  const salt = token(),
    recovery = token(),
    hash = await passwordHash(b.password, salt),
    recoveryHash = await digest(recovery),
    claim = token();
  let rs;
  if (link) {
    rs = await env.DB.batch([
      stmt(
        env,
        "UPDATE email_tokens SET used=? WHERE token_hash=? AND used IS NULL AND expires>? AND password_marker=(SELECT password FROM users WHERE id=user_id)",
        claim,
        link.token_hash,
        Date.now(),
      ),
      stmt(
        env,
        "UPDATE users SET password=?,salt=?,recovery=?,email_verified_at=? WHERE id=? AND EXISTS(SELECT 1 FROM email_tokens WHERE token_hash=? AND used=?)",
        hash,
        salt,
        recoveryHash,
        Date.now(),
        u.id,
        link.token_hash,
        claim,
      ),
      stmt(
        env,
        "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM email_tokens WHERE token_hash=? AND used=?)",
        u.id,
        link.token_hash,
        claim,
      ),
    ]);
    if (!rs[0].meta.changes) fail("لینک قبلاً مصرف شده است", 400);
  } else {
    rs = await env.DB.batch([
      stmt(
        env,
        "UPDATE users SET password=?,salt=?,recovery=? WHERE id=? AND password=?",
        hash,
        salt,
        recoveryHash,
        u.id,
        u.password,
      ),
      stmt(
        env,
        "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)",
        u.id,
        u.id,
        hash,
      ),
    ]);
    if (!rs[0].meta.changes) fail("حساب تغییر کرده؛ دوباره وارد شوید", 409);
  }
  await notify(env, u.email);
  return json({ ok: true, recovery }, 200, {
    "Set-Cookie": cookie("", request),
  });
}
