export function createSecurityUI({
  S,
  api,
  esc,
  showModal,
  modal,
  toast,
  renderAuth,
  showRecovery,
  refresh,
}) {
  let token = null,
    purpose = null;
  function panel() {
    return `<section class="card security-panel"><h2>امنیت حساب</h2><p class="help">رمز عبور، تأیید ایمیل و خروج از دستگاه‌ها</p><div class="quick-actions"><button class="btn secondary" data-action="security-password">تغییر رمز عبور</button><button class="btn secondary" data-action="security-email">تأیید ایمیل</button><button class="btn secondary" data-action="security-logout-all">خروج از همهٔ دستگاه‌ها</button></div></section>`;
  }
  function showLink(kind, raw) {
    purpose = kind;
    token = raw;
    history.replaceState({}, "", location.pathname);
    showModal(
      kind === "reset" ? "انتخاب رمز جدید" : "تأیید ایمیل",
      kind === "reset"
        ? `<form id="security-reset"><div class="field"><label for="reset-password">رمز جدید</label><input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required></div><div class="error" role="alert"></div><button class="btn primary">ذخیرهٔ رمز جدید</button></form>`
        : `<p>برای تأیید آدرس ایمیل، دکمه را بزنید.</p><button class="btn primary" data-action="security-verify-link">تأیید ایمیل من</button>`,
    );
  }
  async function click(el) {
    const a = el.dataset.action;
    if (!a.startsWith("security-")) return false;
    if (a === "security-forgot")
      showModal(
        "بازیابی رمز با ایمیل",
        `<form id="security-forgot"><div class="field"><label for="forgot-email">ایمیل حساب</label><input id="forgot-email" name="email" type="email" dir="ltr" autocomplete="email" required></div><div class="error" role="alert"></div><button class="btn primary">ارسال لینک بازیابی</button></form>`,
      );
    if (a === "security-password")
      showModal(
        "تغییر رمز عبور",
        `<form id="security-password"><div class="field"><label for="current-password">رمز فعلی</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">رمز جدید</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required></div><p class="help">پس از تغییر رمز، همهٔ دستگاه‌ها خارج می‌شوند و کلید بازیابی جدید می‌گیرید.</p><div class="error" role="alert"></div><button class="btn primary">تغییر رمز</button></form>`,
      );
    if (a === "security-email") {
      const d = await api("/auth/security");
      showModal(
        "ایمیل حساب",
        `<p dir="ltr">${esc(d.email)}</p><p>${d.verified ? "ایمیل تأیید شده است ✓" : d.email_enabled ? "ایمیل هنوز تأیید نشده است." : "ارسال ایمیل هنوز توسط مدیر سایت تنظیم نشده است."}</p>${!d.verified && d.email_enabled ? '<button class="btn primary" data-action="security-send-verify">ارسال لینک تأیید</button>' : ""}`,
      );
    }
    if (a === "security-send-verify") {
      el.disabled = true;
      try {
        await api("/auth/send-verification", "POST", {});
        modal.close();
        toast("ایمیل تأیید ارسال شد");
      } catch (e) {
        el.disabled = false;
        throw e;
      }
    }
    if (a === "security-verify-link") {
      el.disabled = true;
      try {
        await api("/auth/verify-email", "POST", { token });
        token = null;
        modal.close();
        toast("ایمیل تأیید شد");
      } catch (e) {
        el.disabled = false;
        throw e;
      }
    }
    if (a === "security-logout-all")
      showModal(
        "خروج از همهٔ دستگاه‌ها",
        '<p>این دستگاه هم از حساب خارج می‌شود.</p><button class="btn danger" data-action="security-confirm-logout">خروج از همه</button>',
      );
    if (a === "security-confirm-logout") {
      await api("/auth/logout-all", "POST", {});
      S.user = null;
      S.auth = "login";
      modal.close();
      renderAuth();
    }
    return true;
  }
  async function submit(form) {
    if (!form.id.startsWith("security-")) return false;
    const b = Object.fromEntries(new FormData(form));
    if (form.id === "security-forgot") {
      const r = await api("/auth/forgot-password", "POST", b);
      showModal("درخواست بازیابی", `<p>${esc(r.message)}</p>`);
      return true;
    }
    const result = await api(
      form.id === "security-reset"
        ? "/auth/reset-password"
        : "/auth/change-password",
      "POST",
      { ...b, token },
    );
    token = null;
    S.user = null;
    S.auth = "login";
    modal.close();
    renderAuth();
    showRecovery(
      result.recovery,
      "رمز تغییر کرد؛ کلید بازیابی جدید را نگه دارید.",
    );
    return true;
  }
  return { panel, click, submit, showLink };
}
