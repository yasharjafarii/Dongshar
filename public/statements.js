import { currencies } from "./ledger.js";
import { displayDay } from "./jalali.js";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const amount = (v, c) =>
  `${new Intl.NumberFormat("fa-IR").format(v / 10 ** currencies[c].digits)} <small>${esc(currencies[c].label)}</small>`;
export async function renderPublicStatement(token) {
  const app = document.getElementById("app");
  document.title = "صورتحساب فقط‌خواندنی — دنگشار";
  let robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex,nofollow,noarchive";
  document.head.append(robots);
  let ref = document.createElement("meta");
  ref.name = "referrer";
  ref.content = "no-referrer";
  document.head.append(ref);
  const shell = (body) =>
    `<main class="statement-page"><header class="between"><a class="logo" href="/" aria-label="دنگشار"><img src="/icon.svg" alt="">دنگشار</a>${window.dongTheme.controls()}</header>${body}<footer class="footer">این لینک اجازهٔ تغییر حساب، عضویت در گروه یا ورود به حساب کاربری را نمی‌دهد.<br>این سایت و برنامه توسط یاشار جعفری ساخته شده است.</footer></main>`;
  app.innerHTML = shell('<div class="empty">در حال دریافت صورتحساب…</div>');
  try {
    const r = await fetch("/api/public/" + encodeURIComponent(token), {
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "گزارش در دسترس نیست");
    const sums = (bs) =>
      Object.entries(bs)
        .map(
          ([c, n]) =>
            `<div class="statement-amount ${n < 0 ? "negative" : "positive"}"><strong>${amount(Math.abs(n), c)}</strong><span class="small">${n > 0 ? `از ${esc(d.host_name)} طلبکارید` : n < 0 ? `به ${esc(d.host_name)} بدهکارید` : "این حساب تسویه است"}</span></div>`,
        )
        .join("") || '<p class="muted small">هنوز تراکنشی ثبت نشده است.</p>';
    app.innerHTML = shell(
      `<div class="intro"><span class="pill">فقط مشاهده · بدون نیاز به عضویت</span><h1>${esc(d.viewer_name)}، حساب شما با ${esc(d.host_name)}</h1><p class="muted">آخرین وضعیت ثبت‌شده · ${displayDay(d.generated_at)}</p></div><section class="card statement-summary"><h2>خلاصهٔ حساب با ${esc(d.host_name)}</h2>${sums(d.balances)}</section>${d.sections.map((s) => `<section class="card statement-section"><div class="card-head"><h2>${s.kind === "group" ? "گروه: " : ""}${esc(s.title)}</h2><span class="pill">${s.kind === "group" ? "حساب دونفره در گروه" : "حساب شخصی"}</span></div><div class="card-body">${sums(s.balances)}${s.kind === "group" ? '<p class="notice">ماندهٔ این بخش، پیشنهاد تسویه بین شما و فرستنده پس از ساده‌سازی بدهی‌های کل گروه است. ردیف‌ها فقط هزینه‌های مشترک این دو نفر و پرداخت‌های بین آن‌ها را نشان می‌دهند؛ جمع ردیف‌ها لزوماً برابر این پیشنهاد نیست. حساب سایر اعضا نمایش داده نمی‌شود.</p>' : ""}${s.rows.map((e) => `<article class="statement-row"><div class="between"><h3>${esc(e.title)}</h3><strong>${amount(e.total, e.currency)}</strong></div><p class="small muted">${displayDay(e.date)} · ${e.kind === "expense" ? "هزینهٔ مشترک" : "پرداخت / تسویه"}</p><div class="statement-details"><div>پرداخت شما: ${amount(e.viewer_paid, e.currency)}</div><div>پرداخت ${esc(d.host_name)}: ${amount(e.host_paid, e.currency)}</div>${e.kind === "expense" ? `<div>سهم شما: ${amount(e.viewer_share, e.currency)}</div><div>سهم ${esc(d.host_name)}: ${amount(e.host_share, e.currency)}</div>` : ""}</div>${e.note ? `<p class="wrap small">${esc(e.note)}</p>` : ""}</article>`).join("") || '<p class="empty small">تراکنش مشترکی در این بخش ثبت نشده است.</p>'}</div></section>`).join("")}<p class="help">اعتبار لینک تا ${displayDay(new Date(d.expires).toISOString())} است. اطلاعات با تازه‌سازی صفحه به‌روز می‌شود.</p>`,
    );
  } catch (e) {
    app.innerHTML = shell(
      `<section class="card empty"><h1>صورتحساب در دسترس نیست</h1><p>${esc(e.message)}</p><p class="small muted">برای دریافت لینک جدید با فرستنده تماس بگیرید.</p></section>`,
    );
  }
}
export function createStatementUI(ctx) {
  const { S, api, showModal, modal, guard, toast, num, day, refresh } = ctx;
  let scope = null;
  async function manage(value) {
    if (!guard()) return;
    scope = value;
    const q = new URLSearchParams(value),
      r = await api("/statements?" + q);
    showModal(
      "لینک مشاهدهٔ صورتحساب",
      `<p>دوستتان با این لینک بدون ورود یا عضویت، فقط حساب مرتبط با شما را می‌بیند و نمی‌تواند چیزی تغییر دهد.</p><div class="notice">${value.scope === "person" ? "حساب شخصی و بخش دونفرهٔ گروه‌های مشترک این دوست در گزارش می‌آید." : "فقط بخش مربوط به شما و این عضو در همین گروه نمایش داده می‌شود."} یادداشت خصوصی مخاطب، رسیدها، نظرها و حساب سایر اعضا نمایش داده نمی‌شود. دارندهٔ لینک می‌تواند آن را باز کند؛ فقط برای همان شخص بفرستید.</div>${r.links.map((l) => `<div class="between"><span class="small">لینک فعال تا ${day(new Date(l.expires).toISOString())}</span><button class="btn danger" data-action="statement-revoke" data-id="${l.id}">باطل کردن لینک</button></div>`).join("")}<div class="field"><label for="statement-days">اعتبار لینک</label><select id="statement-days"><option value="7">۷ روز</option><option value="30" selected>۳۰ روز</option><option value="90">۹۰ روز</option></select></div><p class="help">ساخت لینک جدید، لینک قبلی همین گزارش را باطل می‌کند.</p><div class="form-actions"><button class="btn secondary" data-action="close">بستن</button><button class="btn primary" data-action="statement-create">ساخت لینک فقط‌خواندنی</button></div>`,
    );
  }
  async function click(el) {
    const a = el.dataset.action;
    if (!a.startsWith("statement-") && a !== "group-add-friend") return false;
    if (a === "statement-person") {
      await manage({ scope: "person", account_id: S.personId });
    } else if (a === "statement-group") {
      if (!guard()) return true;
      const self = S.data.group.my_member_id || S.user.id;
      showModal(
        "صورتحساب کدام عضو؟",
        `<p class="muted small">عضو موردنظر را انتخاب کنید؛ حساب سایر اعضا داخل لینک نمایش داده نمی‌شود.</p>${
          S.data.members
            .filter((m) => m.id !== self)
            .map(
              (m) =>
                `<button class="expense-row" data-action="statement-group-member" data-id="${m.id}"><strong>${esc(m.name)}</strong><span class="small muted">ساخت یا مدیریت لینک ←</span></button>`,
            )
            .join("") ||
          '<p class="empty">ابتدا یک دوست به گروه اضافه کنید.</p>'
        }`,
      );
    } else if (a === "statement-group-member")
      await manage({
        scope: "group",
        group_id: S.selected,
        participant_id: el.dataset.id,
      });
    else if (a === "statement-create") {
      el.disabled = true;
      const r = await api("/statements", "POST", {
        ...scope,
        days: Number(document.getElementById("statement-days").value),
      });
      showModal(
        "لینک صورتحساب آماده است",
        `<p class="small muted">فقط‌خواندنی، بدون ثبت‌نام · اعتبار تا ${day(new Date(r.expires).toISOString())}</p><label for="statement-link">لینک مشاهدهٔ صورتحساب</label><input id="statement-link" dir="ltr" readonly value="${esc(location.origin + "/#statement=" + r.token)}"><div class="form-actions"><button class="btn danger" data-action="statement-revoke" data-id="${r.id}">باطل کردن لینک</button><button class="btn primary" data-action="statement-copy">کپی لینک</button></div>`,
      );
    } else if (a === "statement-copy") {
      const input = document.getElementById("statement-link");
      try {
        await navigator.clipboard.writeText(input.value);
        toast("لینک صورتحساب کپی شد");
      } catch {
        input.select();
        toast("لینک را کپی کنید");
      }
    } else if (a === "statement-revoke") {
      el.disabled = true;
      await api("/statements/" + el.dataset.id, "DELETE");
      modal.close();
      toast("لینک باطل شد");
    } else if (a === "group-add-friend") {
      if (!guard()) return true;
      await refresh();
      const candidates = S.people.filter(
        (p) =>
          !p.archived &&
          !S.data.members.some(
            (m) =>
              (!m.removed && m.contact_id === p.id) ||
              (!m.removed &&
                p.counterparty_id &&
                m.user_id === p.counterparty_id),
          ),
      );
      showModal(
        "افزودن از دوستان من",
        `<p class="muted small">دوستِ بدون حساب هم می‌تواند در تقسیم هزینه‌ها حضور داشته باشد. دوست متصل به حساب دنگشار، به گروه دسترسی خواهد داشت.</p>${candidates.map((p) => `<button class="expense-row" data-action="statement-add-member" data-id="${p.id}"><strong>${esc(p.name)}</strong><span class="small muted">${p.shared ? "عضو دارای حساب" : "عضو دستی، بدون دعوت"} · افزودن +</span></button>`).join("") || '<p class="empty">دوست جدیدی برای افزودن ندارید. از بخش دوستان یک نفر اضافه کنید.</p>'}`,
      );
    } else if (a === "statement-add-member") {
      el.disabled = true;
      await api("/groups/" + S.selected + "/members", "POST", {
        account_id: el.dataset.id,
      });
      modal.close();
      await refresh();
      toast("دوست به گروه اضافه شد");
    }
    return true;
  }
  return { click };
}
