import { createSecurityUI } from "./security.js";
import { createSettleAllUI } from "./settle-all.js";
import { createItemsUI } from "./items.js";
import { createOverviewUI } from "./overview.js";
import { dateInput, fromJalali, toJalali, displayDay } from "./jalali.js";
import "./calendar.js";
import { createStatementUI, renderPublicStatement } from "./statements.js";
import { createPeopleUI } from "./people.js";
import { importRows } from "./import.js";
import { openBillHelper, openConversion } from "./helpers.js";
import {
  currencies,
  minor,
  latin,
  split,
  balances,
  simplify,
} from "./ledger.js";
const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (x) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(x);
const money = (n, c = "IRT") =>
  `${num(n / 10 ** currencies[c].digits)} <small>${currencies[c].label}</small>`;
const plain = (n, c) => String(n / 10 ** currencies[c].digits);
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
const day = displayDay;
const myGroupId = () => S.data?.group.my_member_id || S.user.id;
const paths = {
  home: "M3 10l9-7 9 7v10H3z M9 20v-7h6v7",
  groups:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 8a3 3 0 0 1 0 6 M22 21v-2a4 4 0 0 0-3-4",
  chart: "M4 3v18h17 M9 16v-5 M14 16V7 M19 16V4",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M7 17L17 7 M7 7h10v10",
  down: "M7 7l10 10 M7 17h10V7",
  wallet: "M3 6h17v14H3z M3 6V3h14v3 M16 11h5v5h-5z",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12 M6 18L18 6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  logout: "M9 3H3v18h6 M10 12h11 M17 8l4 4-4 4",
  link: "M10 14l4-4 M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M16 8l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0",
  refresh: "M20 7a9 9 0 1 0 1 8 M20 2v6h-6",
  file: "M6 2h8l4 4v16H6z M10 11h4 M10 15h4",
  trash: "M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  edit: "M16 3l5 5-12 12-6 1 1-6z M13 6l5 5",
  sun: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M7 7l-2-2 M17 17l2 2 M17 7l2-2 M5 19l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.wallet}"/></svg>`;
const cats = {
  food: ["🍜", "غذا و نوشیدنی"],
  travel: ["🚕", "رفت‌وآمد"],
  home: ["🏡", "خانه"],
  shopping: ["🛍️", "خرید"],
  fun: ["🎟️", "تفریح"],
  other: ["🧾", "سایر"],
};
const S = {
  user: null,
  groups: [],
  people: [],
  person: null,
  personId: null,
  data: null,
  selected: null,
  view: "home",
  demo: false,
  search: "",
  category: "",
  tab: "expenses",
  seq: 0,
  auth: "login",
};
const app = $("#app"),
  modal = $("#modal");
let toastTimer;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
const responseCache = new Map(),
  pendingReads = new Map();
let cacheEpoch = 0;
function invalidateCache() {
  cacheEpoch++;
  responseCache.clear();
  pendingReads.clear();
}
async function api(path, method = "GET", body) {
  if (method !== "GET") {
    invalidateCache();
    try {
      return await requestAPI(path, method, body);
    } finally {
      invalidateCache();
    }
  }
  const hit = responseCache.get(path);
  if (hit && Date.now() - hit.at < 20000) return hit.data;
  if (pendingReads.has(path)) return pendingReads.get(path);
  const epoch = cacheEpoch,
    job = requestAPI(path, method, body)
      .then((data) => {
        if (epoch === cacheEpoch)
          responseCache.set(path, { at: Date.now(), data });
        return data;
      })
      .finally(() => {
        if (epoch === cacheEpoch) pendingReads.delete(path);
      });
  pendingReads.set(path, job);
  return job;
}
async function requestAPI(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: "پاسخ سرور نامعتبر است" }));
  if (!r.ok) throw Error(data.error || "درخواست انجام نشد");
  return data;
}
function memberName(id) {
  return S.data?.members.find((m) => m.id === id)?.name || "عضو گروه";
}
function avatar(name) {
  return `<span class="avatar">${esc(name?.slice(0, 1) || "د")}</span>`;
}
function currencyOptions(selected) {
  return Object.entries(currencies)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === selected ? "selected" : ""}>${v.label}</option>`,
    )
    .join("");
}
function memberOptions(selected) {
  return S.data.members
    .filter((m) => !m.removed)
    .map(
      (m) =>
        `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}</option>`,
    )
    .join("");
}
function showModal(title, body) {
  modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="iconbtn" data-action="close" aria-label="بستن">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
}
function actions(label) {
  return `<div class="error" role="alert"></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close">انصراف</button><button class="btn primary" type="submit">${label}</button></div>`;
}
function empty(title, detail, action, label) {
  return `<div class="empty"><div class="big">🌿</div><h3>${title}</h3><p class="small">${detail}</p>${action ? `<button class="btn primary" data-action="${action}">${label}</button>` : ""}</div>`;
}
function guard() {
  if (S.demo) {
    toast("این نسخهٔ نمایشی است؛ برای ذخیرهٔ اطلاعات حساب بسازید.");
    return false;
  }
  return true;
}

const securityUI = createSecurityUI({
  S,
  api,
  esc,
  showModal,
  modal,
  toast,
  renderAuth,
  showRecovery,
  refresh,
});
const settleAllUI = createSettleAllUI({
  S,
  api,
  esc,
  money,
  showModal,
  modal,
  toast,
  refresh,
  dateInput,
  fromJalali,
  today,
});
const itemsUI = createItemsUI({
  S,
  api,
  esc,
  money,
  day,
  today,
  showModal,
  modal,
  refresh,
  toast,
  dateInput,
  fromJalali,
});
const overviewUI = createOverviewUI({
  itemSection: itemsUI.section,
  S,
  money,
  esc,
  showModal,
});
const peopleUI = createPeopleUI({
  overallBanner: overviewUI.banner,
  itemSection: itemsUI.section,
  S,
  api,
  esc,
  money,
  num,
  plain,
  today,
  day,
  avatar,
  icon,
  showModal,
  actions,
  modal,
  guard,
  toast,
  refresh,
  shell,
  download,
  currencyOptions,
});
const statementUI = createStatementUI({
  S,
  api,
  showModal,
  modal,
  guard,
  toast,
  num,
  day,
  refresh,
});
function renderAuth() {
  if (!S.user) {
    S.overview = null;
    S.people = [];
    S.person = null;
  }
  const signup = S.auth === "register",
    recover = S.auth === "recover";
  app.innerHTML = `<div class="auth-theme">${peopleUI.themePicker()}</div><div class="auth-layout"><section class="auth-story"><div class="logo"><img src="/icon.svg" alt="">دنگشار</div><h1>خاطره‌ها مشترک،<br>حساب‌ها <em>روشن.</em></h1><p>برای سفرهای بی‌دغدغه، خانه‌های شلوغ و دورهمی‌هایی که دلت نمی‌خواهد تمام شوند.</p><div class="auth-art"><div class="between"><span>🌴 سفر آخر هفته</span><span class="pill">همه‌چیز مرتب است</span></div><div class="between"><span>سهم هر نفر</span><strong class="amount">۲۴۵٬۰۰۰ <small>تومان</small></strong></div><div class="flex">${avatar("س")}${avatar("م")}${avatar("ع")}<span class="small">حساب‌وکتاب ساده، دوستی ماندگار</span></div></div></section><section class="auth-form-wrap"><div class="auth-form"><h2>${signup ? "به دنگشار خوش آمدی" : recover ? "بازیابی حساب" : "دوباره سلام! 👋"}</h2><p>${signup ? "یک حساب بساز و دوستانت را دعوت کن." : recover ? "با کلید بازیابی، رمز جدیدی انتخاب کن." : "وارد شو؛ حساب‌وکتاب‌ها منتظرت هستند."}</p><form id="auth-form">${signup ? '<div class="field"><label for="name">نام شما</label><input id="name" name="name" autocomplete="name" maxlength="60" required placeholder="مثلاً یاشار"></div>' : ""}<div class="field"><label for="email">ایمیل</label><input id="email" name="email" type="email" autocomplete="email" dir="ltr" required placeholder="you@example.com"></div>${recover ? '<div class="field"><label for="recovery">کلید بازیابی</label><input id="recovery" name="recovery" dir="ltr" required></div>' : ""}<div class="field"><label for="password">${recover ? "رمز عبور جدید" : "رمز عبور"}</label><input id="password" name="password" type="password" minlength="10" maxlength="200" autocomplete="${signup || recover ? "new-password" : "current-password"}" required placeholder="حداقل ۱۰ نویسه"></div><div class="error" role="alert"></div><button type="submit" class="btn primary">${signup ? "ساخت حساب" : recover ? "تغییر رمز عبور" : "ورود به دنگشار"} ${icon("arrow")}</button></form><div class="switch">${signup ? "قبلاً ثبت‌نام کرده‌ای؟" : "تازه به جمع ما پیوستی؟"} <button data-action="auth-switch" data-value="${signup ? "login" : "register"}">${signup ? "ورود" : "ساخت حساب"}</button></div>${!signup ? '<div class="switch"><button data-action="auth-switch" data-value="recover">بازیابی با کلید اضطراری</button><button data-action="security-forgot">رمز را فراموش کرده‌ام؛ ارسال ایمیل</button></div>' : ""}<div class="divider">اول یک نگاهی بینداز</div><button class="btn secondary" data-action="demo">مشاهدهٔ نسخهٔ نمایشی ${icon("arrow")}</button><p class="help" style="text-align:center;margin-top:20px">فارسی، ساده و بدون تبلیغات</p><footer class="footer">این سایت و برنامه توسط یاشار جعفری ساخته شده است.</footer></div></section></div>`;
}
function shell() {
  const titles = {
    home: "نمای کلی",
    people: "دوستان",
    person: "حساب فردی",
    group: "دفتر گروه",
    groups: "گروه‌های من",
    activity: "فعالیت‌ها",
    reports: "گزارش هزینه‌ها",
    settings: "تنظیمات",
  };
  app.innerHTML = `<aside class="sidebar"><div class="logo"><img src="/icon.svg" alt="">دنگشار</div><nav class="nav">${[
    ["home", "home", "نمای کلی"],
    ["people", "wallet", "دوستان و حساب‌ها"],
    ["groups", "groups", "گروه‌های من"],
    ["activity", "clock", "فعالیت‌ها"],
    ["reports", "chart", "گزارش‌ها"],
    ["settings", "settings", "تنظیمات"],
  ]
    .map(
      ([v, i, t]) =>
        `<button data-action="view" data-value="${v}" class="${S.view === v ? "active" : ""}">${icon(i)}${t}</button>`,
    )
    .join(
      "",
    )}</nav><div class="between side-heading"><span>گروه‌های شما</span><button data-action="new-group" aria-label="گروه جدید">${icon("plus")}</button></div><div style="overflow:auto;max-height:25vh;min-height:48px;flex-shrink:0">${
    S.groups
      .filter((g) => !g.archived)
      .map(
        (g) =>
          `<button class="groupnav ${g.id === S.selected ? "active" : ""}" data-action="group" data-id="${g.id}"><span>${esc(g.emoji)}</span>${esc(g.name)}</button>`,
      )
      .join("") || '<p class="small muted">هنوز گروهی نساخته‌اید.</p>'
  }</div><div class="side-bottom"><div class="side-note"><strong>🌱 دوستی، بدون حساب باز</strong><span class="muted">لحظه‌های خوب را شریک شو؛ حسابش با دنگشار.</span></div><div class="profile flex">${avatar(S.user.name)}<div><strong class="small">${esc(S.user.name)}</strong><div class="muted small">${S.demo ? "حساب نمایشی" : "حساب شخصی"}</div></div><button class="iconbtn" data-action="logout" aria-label="خروج">${icon("logout")}</button></div></div></aside><main class="main"><header class="topbar"><div class="flex"><button class="iconbtn mobile-menu" data-action="menu" aria-label="فهرست">${icon("menu")}</button><span class="crumb">فضای من <span style="margin:0 12px">/</span> <strong>${titles[S.view]}</strong></span></div><div class="top-actions">${peopleUI.themePicker()}<span class="small muted">${day(today())}</span><span class="online">${S.demo ? "نسخهٔ نمایشی" : navigator.onLine ? "متصل به دنگشار" : "آفلاین"}</span><button class="iconbtn" data-action="refresh" aria-label="تازه‌سازی">${icon("refresh")}</button></div></header>${S.demo ? '<div class="notice between"><span>اطلاعات این صفحه نمونه است و ذخیره نمی‌شود.</span><button class="btn" data-action="start">ساخت حساب ←</button></div>' : ""}<div id="content"></div><footer class="footer"><span>دنگشار؛ حساب‌ها روشن، دوستی‌ها ماندگار</span><span>این سایت و برنامه توسط یاشار جعفری ساخته شده است.</span></footer></main>`;
  renderContent();
}
function renderContent() {
  const target = $("#content");
  if (!target) return;
  if (S.view === "home") {
    peopleUI.renderHome(target);
    return;
  }
  if (S.view === "people") {
    peopleUI.renderPeople(target);
    return;
  }
  if (S.view === "person") {
    peopleUI.renderAccount(target);
    return;
  }
  if (S.view === "groups") {
    target.innerHTML = `<div class="intro between"><div><h1>گروه‌های من</h1><p>هر جمع، یک دفتر حساب مشترک.</p></div><button class="btn primary" data-action="new-group">${icon("plus")} گروه جدید</button></div><div class="group-cards">${S.groups.map((g) => `<button class="card group-card" data-action="group" data-id="${g.id}"><div class="emoji">${esc(g.emoji)}</div><h3>${esc(g.name)}</h3><p>${num(g.member_count)} عضو · ${currencies[g.currency].label} ${g.archived ? "· بایگانی‌شده" : ""}</p><div style="margin-top:20px" class="small positive">مشاهدهٔ حساب‌ها ←</div></button>`).join("")}</div>${!S.groups.length ? empty("اولین جمع را بساز", "سفر، هم‌خانه‌ها یا یک شام دوستانه؛ از همین‌جا شروع کن.", "new-group", "ساخت گروه") : ""}`;
    return;
  }
  if (S.view === "settings") {
    renderSettings(target);
    return;
  }
  if (!S.data) {
    target.innerHTML = empty(
      "به دنگشار خوش آمدی!",
      "گروهی بساز یا از طریق لینک دعوت دوستانت عضو شو.",
      "new-group",
      "ساخت اولین گروه",
    );
    return;
  }
  const d = S.data,
    g = d.group,
    b = balances(d.expenses, d.settlements),
    c = g.currency,
    my = b[c]?.[myGroupId()] || 0;
  const intro = `<div class="intro between"><div><div class="flex"><h1>${esc(g.name)}</h1><span class="tag">${num(d.members.filter((m) => !m.removed).length)} نفر</span></div><p>${S.view === "group" ? "همهٔ خرج‌ها یک‌جا؛ با خیال راحت کنار هم باشید." : S.view === "reports" ? "تصویر روشن‌تری از خرج‌های مشترک." : "داستان حساب‌وکتاب این گروه."}</p></div><button class="btn primary" data-action="new-expense" ${g.archived ? "disabled" : ""}>${icon("plus")} هزینهٔ جدید</button></div>${g.archived ? '<div class="notice">این گروه بایگانی شده است. مدیر می‌تواند از تنظیمات آن را فعال کند.</div>' : ""}`;
  if (S.view === "activity") {
    target.innerHTML =
      intro +
      `<section class="card"><div class="card-head"><h2>آخرین فعالیت‌ها</h2><span class="muted small">تا ۱۰۰ فعالیت اخیر</span></div>${d.activity.map((a) => `<div class="activity-row">${avatar(a.name)}<div><p><strong>${esc(a.name)}</strong> ${esc(a.message)}</p><small>${day(a.created_at)}</small></div></div>`).join("") || empty("هنوز فعالیتی ندارید", "اولین هزینه را ثبت کنید.")}</section>`;
    return;
  }
  if (S.view === "reports") {
    renderReports(target, intro, b);
    return;
  }
  const total = d.expenses
      .filter((e) => e.currency === c)
      .reduce((s, e) => s + e.amount, 0),
    share = d.expenses
      .filter((e) => e.currency === c)
      .reduce(
        (s, e) =>
          s + (e.allocations.find((x) => x.id === myGroupId())?.value || 0),
        0,
      );
  target.innerHTML =
    intro +
    `<section class="stats"><div class="stat featured"><div class="label">${icon("wallet")} ماندهٔ حساب شما</div><div class="value">${money(Math.abs(my), c)}</div><div class="small">${my > 0 ? "از جمع طلبکارید" : my < 0 ? "به جمع بدهکارید" : "همه‌چیز صاف و ساده است"} · ${currencies[c].label}</div></div><div class="stat"><div class="label">${icon("chart")} مجموع هزینه‌های گروه</div><div class="value">${money(total, c)}</div><div class="small muted">${num(d.expenses.filter((e) => e.currency === c).length)} هزینه ثبت‌شده با این واحد</div></div><div class="stat"><div class="label">${icon("groups")} سهم شما از هزینه‌ها</div><div class="value">${money(share, c)}</div><div class="small muted">با احتساب روش تقسیم هر هزینه</div></div></section><div class="content-grid"><section class="card"><div class="card-head"><h2>دفتر حساب گروه</h2><button class="small muted flex" data-action="export">${icon("file")} خروجی CSV</button></div><div class="tabs"><button data-action="tab" data-value="expenses" class="${S.tab === "expenses" ? "active" : ""}">هزینه‌ها <span class="pill">${num(d.expenses.length)}</span></button><button data-action="tab" data-value="settlements" class="${S.tab === "settlements" ? "active" : ""}">تسویه‌ها</button><button data-action="tab" data-value="recurring" class="${S.tab === "recurring" ? "active" : ""}">تکرارشونده</button></div><div class="filter ${S.tab === "expenses" ? "" : "hidden"}"><div class="search">${icon("search")}<input id="search" aria-label="جست‌وجوی هزینه" placeholder="جست‌وجو بین هزینه‌ها…" value="${esc(S.search)}"></div><select id="category-filter" aria-label="دسته‌بندی"><option value="">همهٔ دسته‌ها</option>${Object.entries(
      cats,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${S.category === k ? "selected" : ""}>${v[1]}</option>`,
      )
      .join(
        "",
      )}</select></div><div id="ledger-list"></div><div class="card-footer">هزینه‌ها و تسویه‌ها برای همهٔ اعضای گروه قابل مشاهده‌اند.</div></section><aside class="stack aside-grid"><section class="card"><div class="card-head"><h2>حساب اعضا</h2><span class="muted small">${currencies[c].label}</span></div><div class="card-body">${d.members
      .map((m) => {
        const n = b[c]?.[m.id] || 0;
        return `<div class="member-line">${avatar(m.name)}<span class="name">${esc(m.name)} ${m.removed ? "(حذف‌شده)" : ""} ${m.id === myGroupId() ? '<span class="muted small">(شما)</span>' : ""}</span><span class="amount ${n < 0 ? "negative" : "positive"}">${num(Math.abs(n) / 10 ** currencies[c].digits)}<small>${n > 0 ? "طلبکار" : n < 0 ? "بدهکار" : "تسویه"}</small></span>${g.owner === S.user.id && m.user_id !== g.owner && !m.removed && !g.archived ? `<button class="iconbtn" data-action="group-remove-member" data-id="${m.id}" aria-label="حذف ${esc(m.name)} از گروه">${icon("trash")}</button>` : ""}</div>${(() => {
          const p = S.overview?.find((p) =>
            p.groups.some((x) => x.id === g.id && x.participant_id === m.id),
          );
          return p
            ? `<button class="small muted overall-inline" data-action="overall-person" data-id="${esc(p.id)}">ماندهٔ کلی با این فرد: ${money(Math.abs(p.balances[c] || 0), c)} ${(p.balances[c] || 0) > 0 ? "طلب شما" : (p.balances[c] || 0) < 0 ? "بدهی شما" : "تسویه"}</button>`
            : "";
        })()}`;
      })
      .join(
        "",
      )}${g.owner === S.user.id && !g.archived ? '<button class="invite-card" data-action="group-add-friend">+ افزودن از دوستان من</button>' : ""}<button class="invite-card" data-action="invite">دعوت با لینک عضویت</button><button class="invite-card" data-action="statement-group">لینک مشاهدهٔ حساب عضو</button></div></section><section class="settle-card"><div class="art">${icon("check")}</div><h3>وقت صاف کردن حساب‌هاست؟</h3><p>با ساده‌سازی بدهی‌ها، جمع را با پرداخت‌های کمتری تسویه کنید.</p><button class="btn primary" data-action="balances">مشاهده و تسویه ${icon("arrow")}</button></section></aside></div>`;
  renderList();
}
function renderList() {
  const target = $("#ledger-list");
  if (!target) return;
  const d = S.data;
  if (S.tab === "settlements") {
    target.innerHTML =
      d.settlements
        .map(
          (p) =>
            `<div class="expense-row"><div class="expense-icon home">✓</div><div class="expense-info"><strong>${esc(memberName(p.sender))} ← ${esc(memberName(p.receiver))}</strong><span>پرداخت از ${esc(memberName(p.sender))} به ${esc(memberName(p.receiver))} · ${day(p.date)}</span></div><div class="expense-price"><strong>${money(p.amount, p.currency)}</strong></div>${p.creator === S.user.id || d.group.owner === S.user.id ? `<button class="iconbtn" data-action="delete-settlement" data-id="${p.id}" aria-label="لغو تسویه">${icon("trash")}</button>` : ""}</div>`,
        )
        .join("") ||
      empty(
        "هنوز تسویه‌ای ثبت نشده",
        "پرداخت‌های انجام‌شده را اینجا ثبت کنید.",
        "settle",
        "ثبت تسویه",
      );
    return;
  }
  if (S.tab === "recurring") {
    target.innerHTML =
      d.recurring
        .map(
          (r) =>
            `<div class="expense-row"><div class="expense-icon">🔁</div><div class="expense-info"><strong>${esc(r.template.title)}</strong><span>${r.cadence === "weekly" ? "هفتگی" : "ماهانه"} · نوبت بعد ${day(r.next_date)}</span></div><div class="expense-price"><strong>${money(r.template.amount, r.template.currency)}</strong></div><button class="iconbtn" data-action="stop-recurring" data-id="${r.id}" aria-label="توقف تکرار">${icon("close")}</button></div>`,
        )
        .join("") ||
      empty(
        "برنامهٔ تکرارشونده‌ای ندارید",
        "هنگام ثبت هزینه، تکرار هفتگی یا ماهانه را انتخاب کنید.",
      );
    return;
  }
  const rows = d.expenses.filter(
    (e) =>
      (!S.category || e.category === S.category) &&
      `${e.title} ${e.note} ${e.payers.map((p) => memberName(p.id)).join(" ")}`
        .toLowerCase()
        .includes(S.search.toLowerCase()),
  );
  let last = "";
  target.innerHTML =
    rows
      .map((e) => {
        const cat = cats[e.category] || cats.other,
          share = e.allocations.find((x) => x.id === myGroupId())?.value || 0,
          paid = e.payers.find((x) => x.id === myGroupId())?.value || 0,
          n = paid - share;
        const header =
          last !== e.date ? `<div class="day-label">${day(e.date)}</div>` : "";
        last = e.date;
        return (
          header +
          `<button class="expense-row" data-action="detail" data-id="${e.id}"><div class="expense-icon ${e.category}">${cat[0]}</div><div class="expense-info"><strong>${esc(e.title)} ${e.has_receipt ? "📎" : ""}</strong><span>${esc(e.payers.map((p) => memberName(p.id)).join(" و "))} پرداخت کرد · ${cat[1]}</span></div><div class="expense-price"><strong>${money(e.amount, e.currency)}</strong><span class="${n < 0 ? "negative" : "positive"}">${n === 0 ? "بدون مانده برای شما" : `${num(Math.abs(n) / 10 ** currencies[e.currency].digits)} ${n > 0 ? "طلب شما" : "بدهی شما"}`}</span></div></button>`
        );
      })
      .join("") ||
    empty(
      "هزینه‌ای پیدا نشد",
      S.search || S.category
        ? "جست‌وجو یا فیلتر را تغییر دهید."
        : "اولین هزینهٔ مشترک را ثبت کنید.",
      S.search || S.category ? null : "new-expense",
      "ثبت هزینه",
    );
}
function renderReports(target, intro, b) {
  const d = S.data;
  target.innerHTML =
    intro +
    `<div class="between" style="margin-bottom:20px"><p class="muted small">واحدهای پول جدا محاسبه می‌شوند؛ نرخ تبدیل خودکار نداریم.</p><div class="flex"><button class="btn secondary" data-action="import">ورود CSV</button><button class="btn secondary" data-action="backup">${icon("file")} پشتیبان JSON</button></div></div><div class="group-cards">${[
      ...new Set(d.expenses.map((e) => e.currency)),
    ]
      .map((c) => {
        const expenses = d.expenses.filter((e) => e.currency === c),
          total = expenses.reduce((s, e) => s + e.amount, 0);
        return `<section class="card"><div class="card-head"><h2>${currencies[c].label}</h2><strong>${money(total, c)}</strong></div><div class="card-body">${Object.entries(
          cats,
        )
          .map(([k, v]) => {
            const n = expenses
              .filter((e) => e.category === k)
              .reduce((s, e) => s + e.amount, 0);
            return n
              ? `<div class="bar-row"><div class="between"><span>${v[0]} ${v[1]}</span><span>${money(n, c)}</span></div><div class="bar"><i style="width:${(100 * n) / total}%"></i></div></div>`
              : "";
          })
          .join("")}</div></section>`;
      })
      .join(
        "",
      )}</div><section class="card" style="margin-top:24px"><div class="card-head"><h2>ریز حساب اعضا</h2><button class="btn soft" data-action="balances">تسویهٔ گروه</button></div><div class="table-scroll"><table><thead><tr><th>عضو</th><th>واحد</th><th>پرداخت هزینه</th><th>سهم هزینه</th><th>مانده پس از تسویه</th></tr></thead><tbody>${Object.entries(
      b,
    )
      .flatMap(([c, values]) =>
        d.members.map(
          (m) =>
            `<tr><td>${esc(m.name)}</td><td>${currencies[c].label}</td><td>${money(
              d.expenses
                .filter((e) => e.currency === c)
                .reduce(
                  (s, e) =>
                    s + (e.payers.find((p) => p.id === m.id)?.value || 0),
                  0,
                ),
              c,
            )}</td><td>${money(
              d.expenses
                .filter((e) => e.currency === c)
                .reduce(
                  (s, e) =>
                    s + (e.allocations.find((p) => p.id === m.id)?.value || 0),
                  0,
                ),
              c,
            )}</td><td class="${values[m.id] < 0 ? "negative" : "positive"}">${money(values[m.id] || 0, c)}</td></tr>`,
        ),
      )
      .join("")}</tbody></table></div></section>`;
}
function renderSettings(target) {
  const g = S.data?.group;
  target.innerHTML = `<div class="intro"><h1>تنظیمات</h1><p>حساب شما و تنظیمات گروه جاری.</p></div>${securityUI.panel()}<section class="card theme-settings"><h2>ظاهر برنامه</h2>${peopleUI.themePicker()}</section><div class="content-grid"><section class="card"><div class="card-head"><h2>پروفایل من</h2></div><div class="card-body"><form id="profile-form"><div class="field"><label for="profile-name">نام نمایشی</label><input id="profile-name" name="name" value="${esc(S.user.name)}" required maxlength="60"></div><p class="muted small">${esc(S.user.email)}</p>${actions("ذخیرهٔ نام")}</form></div></section>${g ? `<section class="card"><div class="card-head"><h2>گروه ${esc(g.name)}</h2></div><div class="card-body">${g.owner === S.user.id ? `<form id="group-settings"><div class="field"><label for="group-name">نام گروه</label><input id="group-name" name="name" value="${esc(g.name)}" required maxlength="80"></div><label class="flex"><input type="checkbox" name="archived" ${g.archived ? "checked" : ""}> بایگانی گروه</label>${actions("ذخیرهٔ گروه")}</form><button class="btn secondary" style="margin-top:15px" data-action="rotate-invite">باطل کردن لینک دعوت قبلی</button>` : '<p class="muted small">تنظیمات گروه در اختیار سازندهٔ آن است.</p>'}</div></section>` : ""}</div><div class="notice" style="margin-top:24px">کلید بازیابی را در جای امن نگه دارید. بازیابی ایمیلی پس از تنظیم سرویس ارسال توسط مدیر سایت فعال است. برای نصب روی موبایل، از منوی مرورگر «افزودن به صفحهٔ اصلی» را انتخاب کنید.</div>`;
}

async function refresh(force = true) {
  if (S.demo) {
    shell();
    return;
  }
  if (force) invalidateCache();
  const seq = ++S.seq;
  const [me, peopleResult, overall] = await Promise.all([
    api("/me"),
    api("/people"),
    api("/overview"),
  ]);
  if (seq !== S.seq) return;
  S.user = me.user;
  S.groups = me.groups;
  S.people = peopleResult.people;
  S.overview = overall.people;
  S.selected = S.groups.some((g) => g.id === S.selected)
    ? S.selected
    : S.groups.find((g) => !g.archived)?.id || S.groups[0]?.id || null;
  const needsGroup = [
    "group",
    "activity",
    "reports",
    "balances",
    "settings",
  ].includes(S.view);
  const [personalData, d] = await Promise.all([
    S.view === "person" && S.personId ? api("/people/" + S.personId) : null,
    needsGroup && S.selected ? api("/groups/" + S.selected) : null,
  ]);
  if (seq !== S.seq) return;
  S.person = personalData;
  if (needsGroup) S.data = d;
  shell();
}
async function selectGroup(id) {
  S.selected = id;
  S.view = "group";
  S.search = "";
  S.category = "";
  S.tab = "expenses";
  await refresh(false);
}
function newGroup() {
  if (!guard()) return;
  showModal(
    "یک جمع تازه بساز",
    `<form id="group-form"><div class="field"><label for="group-title">اسم گروه</label><input id="group-title" name="name" required maxlength="80" placeholder="مثلاً سفر به شمال"></div><div class="fields"><div class="field"><label for="emoji">نوع گروه</label><select id="emoji" name="emoji"><option value="✈️">✈️ سفر</option><option value="🏡">🏡 خانه و هم‌خانه‌ها</option><option value="☕">☕ دورهمی دوستانه</option><option value="🌴">🌴 تفریح و تعطیلات</option><option value="🎉">🎉 جشن و مناسبت</option></select></div><div class="field"><label for="currency">واحد پول پیش‌فرض</label><select id="currency" name="currency">${currencyOptions("IRT")}</select></div></div><p class="help">بعد از ساخت گروه، لینک دعوت را برای دوستانت بفرست.</p>${actions("ساخت گروه")}</form>`,
  );
}
let editing = null;
let expenseRequestId = null;
let settlementRequestId = null;
let pendingImport = null;
function importModal() {
  if (!guard()) return;
  pendingImport = null;
  showModal(
    "ورود گروهی هزینه‌ها",
    `<p class="small muted">فایل نمونه را بگیرید و تا ۲۰ هزینه را با قالب آن وارد کنید. تقسیم هزینه‌های واردشده مساوی است. فایل خروجی Splitwise باید ابتدا به این قالب تبدیل شود.</p><button class="btn secondary" data-action="import-template" style="margin:15px 0">دریافت CSV نمونه</button><form id="import-form"><label for="import-file">فایل CSV</label><input id="import-file" type="file" accept=".csv,text/csv" required><div id="import-preview" class="small"></div>${actions("تأیید و ثبت همهٔ ردیف‌ها")}</form>`,
  );
}

function expenseForm(id) {
  if (!guard()) return;
  if (!S.data) {
    newGroup();
    return;
  }
  const e = id ? S.data.expenses.find((e) => e.id === id) : null;
  editing = e;
  expenseRequestId = crypto.randomUUID();
  const c = e?.currency || S.data.group.currency,
    defaults =
      !e && S.data.group.defaults ? JSON.parse(S.data.group.defaults) : null;
  showModal(
    e ? "ویرایش هزینه" : "ثبت یک هزینهٔ مشترک",
    `<form id="expense-form"><div class="field"><label for="expense-title">بابت چی هزینه کردید؟</label><input id="expense-title" name="title" value="${esc(e?.title || "")}" required maxlength="120" placeholder="مثلاً شام دورهمی"></div><div class="fields"><div class="field"><label for="amount">مبلغ کل</label><input id="amount" name="amount" value="${e ? plain(e.amount, c) : ""}" inputmode="decimal" required placeholder="۰"></div><div class="field"><label for="expense-currency">واحد پول</label><select id="expense-currency" name="currency">${currencyOptions(c)}</select></div>${dateInput("date", e?.date || today())}<div class="field"><label for="category">دسته‌بندی</label><select id="category" name="category">${Object.entries(
      cats,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${e?.category === k ? "selected" : ""}>${v[0]} ${v[1]}</option>`,
      )
      .join(
        "",
      )}</select></div></div><div class="field"><label for="payer">چه کسی پرداخت کرد؟</label><select id="payer" name="payer">${memberOptions(e?.payers[0]?.id || myGroupId())}<option value="multiple" ${e?.payers.length > 1 ? "selected" : ""}>چند نفر پرداخت کردند</option></select></div><div id="payer-list" class="split-list ${e?.payers.length > 1 ? "" : "hidden"}">${S.data.members
      .filter((m) => !m.removed)
      .map(
        (m) =>
          `<label class="split-row"><span>${esc(m.name)}</span><input type="text" inputmode="decimal" data-payer="${m.id}" aria-label="پرداخت ${esc(m.name)}" value="${plain(e?.payers.find((p) => p.id === m.id)?.value || 0, c)}"></label>`,
      )
      .join(
        "",
      )}</div><div class="field"><label for="mode">چطور تقسیم شود؟</label><select id="mode" name="mode">${[
      ["equal", "مساوی"],
      ["exact", "مبلغ دقیق هر نفر"],
      ["percent", "درصدی"],
      ["shares", "بر اساس تعداد سهم"],
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${(e ? "exact" : defaults?.mode || "equal") === k ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="flex" style="margin-bottom:12px;flex-wrap:wrap"><button class="btn soft small" type="button" data-action="itemize">تقسیم ریزِ اقلام</button><button class="btn soft small" type="button" data-action="convert">تبدیل با نرخ دلخواه</button></div><div class="split-list" id="split-list">${S.data.members
      .filter((m) => !m.removed)
      .map((m) => {
        const p =
          e?.allocations.find((x) => x.id === m.id) ||
          defaults?.entries.find((x) => x.id === m.id);
        return `<div class="split-row"><input type="checkbox" data-member="${m.id}" aria-label="انتخاب ${esc(m.name)}" ${(!e && !defaults) || p ? "checked" : ""}><span>${esc(m.name)} ${m.id === myGroupId() ? "(شما)" : ""}</span><input type="text" inputmode="decimal" data-share="${m.id}" aria-label="سهم ${esc(m.name)}" value="${e ? plain(p?.value || 0, c) : (p?.value ?? 1)}"></div>`;
      })
      .join(
        "",
      )}<div id="split-preview" class="split-preview" aria-live="polite"></div></div>${e ? "" : '<label class="flex small"><input type="checkbox" name="saveDefault"> این روش درصدی/سهمی را پیش‌فرض گروه کن</label>'}<div class="fields" style="margin-top:17px"><div class="field"><label for="cadence">تکرار خودکار</label><select id="cadence" name="cadence" ${e ? "disabled" : ""}><option value="">بدون تکرار</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option></select>${e ? '<p class="help">ویرایش این هزینه، برنامهٔ تکرار قبلی را تغییر نمی‌دهد.</p>' : ""}</div><div class="field"><label for="receipt">عکس رسید (اختیاری)</label><input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp"><p class="help">حداکثر ۲۵۰ کیلوبایت${e?.has_receipt ? " · رسید فعلی حفظ می‌شود" : ""}</p></div></div><div class="field"><label for="note">یادداشت</label><textarea id="note" name="note" maxlength="2000" placeholder="چیزی هست که بقیه باید بدانند؟">${esc(e?.note || "")}</textarea></div>${actions(e ? "ذخیرهٔ تغییرات" : "ثبت هزینه")}</form>`,
  );
  updateSplit();
}
function readExpense(form) {
  const f = new FormData(form),
    c = f.get("currency"),
    a = minor(f.get("amount"), c),
    mode = f.get("mode");
  const entries = $$("[data-member]:checked", form).map((x) => ({
    id: x.dataset.member,
    value:
      mode === "equal"
        ? 1
        : mode === "exact"
          ? minor($(`[data-share="${x.dataset.member}"]`, form).value, c)
          : Number(latin($(`[data-share="${x.dataset.member}"]`, form).value)),
  }));
  return {
    requestId: expenseRequestId,
    title: f.get("title"),
    amount: a,
    currency: c,
    date: fromJalali(f.get("date")),
    category: f.get("category"),
    note: f.get("note"),
    mode,
    entries,
    payers:
      f.get("payer") === "multiple"
        ? $$("[data-payer]", form)
            .map((x) => ({ id: x.dataset.payer, value: minor(x.value, c) }))
            .filter((x) => x.value > 0)
        : [{ id: f.get("payer"), value: a }],
    cadence: f.get("cadence") || "",
    version: editing?.version,
  };
}
function updateSplit() {
  const f = $("#expense-form");
  if (!f) return;
  const mode = f.elements.mode.value;
  $$("[data-share]", f).forEach((x) =>
    x.classList.toggle("hidden", mode === "equal"),
  );
  $("#payer-list").classList.toggle(
    "hidden",
    f.elements.payer.value !== "multiple",
  );
  try {
    const b = readExpense(f),
      values = split(b.amount, b.mode, b.entries);
    $("#split-preview").textContent = values
      .map(
        (x) =>
          `${memberName(x.id)}: ${num(x.value / 10 ** currencies[b.currency].digits)}`,
      )
      .join(" · ");
  } catch (e) {
    $("#split-preview").textContent = f.elements.amount.value
      ? e.message
      : "مبلغ را وارد کنید تا سهم‌ها محاسبه شوند.";
  }
}
function balanceModal() {
  const b = balances(S.data.expenses, S.data.settlements);
  showModal(
    "با پرداخت‌های کمتر تسویه کنید",
    `<p class="muted small">این پیشنهادها ماندهٔ هر فرد را حفظ می‌کنند. فقط پرداختی را ثبت کنید که واقعاً انجام شده است.</p>${
      Object.entries(b)
        .map(
          ([c, v]) =>
            `<h3 style="margin-top:22px">${currencies[c].label}</h3>${
              simplify(v)
                .map(
                  (p) =>
                    `<div class="expense-row" style="padding-inline:0"><div class="expense-info"><strong>${esc(memberName(p.sender))} به ${esc(memberName(p.receiver))}</strong><span>پیشنهاد تسویه</span></div><div class="expense-price"><strong>${money(p.amount, c)}</strong></div><button class="btn soft small" data-action="settle" data-sender="${p.sender}" data-receiver="${p.receiver}" data-currency="${c}" data-amount="${p.amount}">ثبت</button></div>`,
                )
                .join("") || '<p class="positive small">حساب‌ها تسویه است ✓</p>'
            }`,
        )
        .join("") || empty("حسابی باز نمانده", "از لحظه‌های مشترک لذت ببرید.")
    }<button class="btn secondary" style="margin-top:20px" data-action="settle">ثبت پرداخت دلخواه</button>`,
  );
}
function settleForm(data = {}) {
  if (!guard()) return;
  settlementRequestId = crypto.randomUUID();
  const c = data.currency || S.data.group.currency;
  showModal(
    "ثبت تسویه",
    `<form id="settle-form"><div class="notice">این فرم پول جابه‌جا نمی‌کند؛ پرداخت انجام‌شده را در دفتر گروه ثبت می‌کند.</div><div class="fields"><div class="field"><label for="sender">پرداخت‌کننده</label><select id="sender" name="sender">${memberOptions(data.sender || myGroupId())}</select></div><div class="field"><label for="receiver">دریافت‌کننده</label><select id="receiver" name="receiver">${memberOptions(data.receiver || S.data.members.find((m) => m.id !== myGroupId())?.id)}</select></div><div class="field"><label for="settle-amount">مبلغ</label><input id="settle-amount" name="amount" inputmode="decimal" required value="${data.amount ? plain(Number(data.amount), c) : ""}"></div><div class="field"><label for="settle-currency">واحد پول</label><select id="settle-currency" name="currency">${currencyOptions(c)}</select></div></div>${dateInput("settle-date", today(), "تاریخ پرداخت (شمسی)")}${actions("پرداخت انجام شده؛ ثبت کن")}</form>`,
  );
}
async function detail(id) {
  const e = S.data.expenses.find((e) => e.id === id);
  showModal(
    e.title,
    `<div class="detail-total">${money(e.amount, e.currency)}</div><p class="muted small" style="text-align:center">${day(e.date)} · ${(cats[e.category] || cats.other)[1]}</p><div class="detail-grid"><div><h3>پرداخت‌کننده‌ها</h3>${e.payers.map((p) => `<div class="between"><span>${esc(memberName(p.id))}</span><span>${money(p.value, e.currency)}</span></div>`).join("")}</div><div><h3>سهم هر نفر</h3>${e.allocations.map((p) => `<div class="between"><span>${esc(memberName(p.id))}</span><span>${money(p.value, e.currency)}</span></div>`).join("")}</div></div><p class="wrap small" style="margin:16px 0">${esc(e.note)}</p><div id="receipt-view"></div>${e.creator === S.user.id || S.data.group.owner === S.user.id ? `<div class="flex"><button class="btn secondary" data-action="edit-expense" data-id="${id}">${icon("edit")} ویرایش</button><button class="btn danger" data-action="delete-expense" data-id="${id}">${icon("trash")} حذف</button></div>` : ""}<h3 style="margin-top:25px">گفت‌وگوی هزینه</h3><div id="comments-list"><p class="small muted">در حال دریافت…</p></div><form id="comment-form" data-id="${id}" style="margin-top:15px"><label for="comment">نظر شما</label><textarea id="comment" name="body" required maxlength="1000" placeholder="یک یادداشت برای دوستانت…"></textarea>${actions("ثبت نظر")}</form>`,
  );
  const [comments, receipt] = S.demo
    ? [[], null]
    : await Promise.all([
        api(`/groups/${S.selected}/expenses/${id}/comments`),
        e.has_receipt
          ? api(`/groups/${S.selected}/expenses/${id}/receipt`)
          : null,
      ]);
  if ($("#comment-form")?.dataset.id !== id) return;
  $("#comments-list").innerHTML =
    comments
      .map(
        (c) =>
          `<div class="comment"><strong>${esc(c.name)}</strong><small>${day(c.created_at)}</small><p>${esc(c.body)}</p></div>`,
      )
      .join("") || '<p class="muted small">هنوز نظری ثبت نشده است.</p>';
  if (receipt?.receipt)
    $("#receipt-view").innerHTML =
      `<img class="receipt" src="${esc(receipt.receipt)}" alt="رسید هزینه">`;
}
function invite() {
  if (!guard()) return;
  const link = location.origin + "/?invite=" + S.data.group.invite;
  showModal(
    "دوستانت را به جمع دعوت کن",
    `<p class="muted small">هر کسی این لینک را داشته باشد، پس از ورود می‌تواند عضو گروه شود و حساب‌های آن را ببیند.</p><div class="field" style="margin-top:20px"><label for="invite-link">لینک دعوت ${esc(S.data.group.name)}</label><input id="invite-link" dir="ltr" readonly value="${esc(link)}"></div><button class="btn primary" data-action="copy-invite">${icon("link")} کپی لینک</button>`,
  );
}
function confirmModal(title, description, action, id) {
  if (!guard()) return;
  showModal(
    title,
    `<p>${esc(description)}</p><div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn danger" data-action="${action}" data-id="${id || ""}">بله، انجام بده</button></div>`,
  );
}
function download(name, text, type) {
  const a = document.createElement("a"),
    u = URL.createObjectURL(new Blob([text], { type }));
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
function exportCSV() {
  const cell = (s) =>
    '"' +
    String(s ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const rows = [
    [
      "نوع",
      "عنوان",
      "تاریخ",
      "مبلغ",
      "واحد",
      "پرداخت‌کنندگان",
      "سهم‌ها",
      "یادداشت",
    ],
    ...S.data.expenses.map((e) => [
      "هزینه",
      e.title,
      toJalali(e.date, true),
      plain(e.amount, e.currency),
      currencies[e.currency].label,
      e.payers
        .map((p) => `${memberName(p.id)}: ${plain(p.value, e.currency)}`)
        .join(" / "),
      e.allocations
        .map((p) => `${memberName(p.id)}: ${plain(p.value, e.currency)}`)
        .join(" / "),
      e.note,
    ]),
    ...S.data.settlements.map((s) => [
      "تسویه",
      `${memberName(s.sender)} به ${memberName(s.receiver)}`,
      toJalali(s.date, true),
      plain(s.amount, s.currency),
      currencies[s.currency].label,
      "",
      "",
      "",
    ]),
  ];
  download(
    "dong-export.csv",
    "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
async function backup() {
  if (!guard()) return;
  toast("در حال دریافت رسیدها برای پشتیبان…");
  const expenses = [];
  for (const e of S.data.expenses) {
    const receipt = e.has_receipt
      ? await api(`/groups/${S.selected}/expenses/${e.id}/receipt`)
      : {};
    const comments = await api(
      `/groups/${S.selected}/expenses/${e.id}/comments`,
    );
    expenses.push({ ...e, ...receipt, comments });
  }
  download(
    "dong-backup.json",
    JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        ...S.data,
        expenses,
      },
      null,
      2,
    ),
    "application/json",
  );
  toast("پشتیبان گروه دریافت شد");
}
async function joinPending() {
  if (await peopleUI.pendingJoin()) return;
  const invite = sessionStorage.getItem("dong-invite");
  if (!invite) return;
  showModal(
    "دعوت به یک گروه",
    `<p>یک لینک دعوت باز کرده‌اید. با تأیید، نام شما برای اعضای گروه نمایش داده می‌شود.</p><div class="form-actions"><button class="btn secondary" data-action="dismiss-join">فعلاً نه</button><button class="btn primary" data-action="join">پیوستن به گروه</button></div>`,
  );
}

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const a = el.dataset.action,
    id = el.dataset.id;
  try {
    if (await securityUI.click(el)) return;
    if (await settleAllUI.click(el)) return;
    if (await itemsUI.click(el)) return;
    if (overviewUI.click(el)) return;
    if (el.dataset.action === "group-remove-member") {
      if (!guard()) return;
      const m = S.data.members.find((m) => m.id === el.dataset.id);
      showModal(
        "حذف عضو از گروه",
        `<p>آیا ${esc(m.name)} از گروه حذف شود؟</p><p class="notice">سوابق حفظ می‌شوند. حذف فقط پس از تسویهٔ مانده و توقف هزینه‌های تکرارشونده ممکن است. دسترسی عضو و لینک دعوت قبلی باطل می‌شود.</p><div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn danger" data-action="confirm-remove-member" data-id="${m.id}">حذف عضو</button></div>`,
      );
      return;
    }
    if (el.dataset.action === "confirm-remove-member") {
      await api(
        `/groups/${S.selected}/members/${encodeURIComponent(el.dataset.id)}`,
        "DELETE",
      );
      modal.close();
      await refresh();
      toast("عضو حذف شد؛ سوابق محفوظ است");
      return;
    }
    if (await statementUI.click(el)) return;
    if (["person-open", "group"].includes(el.dataset.action)) modal.close();
    if (await peopleUI.click(el)) return;
    if (a === "close") {
      modal.close();
      return;
    }
    if (a === "auth-switch") {
      S.auth = el.dataset.value;
      renderAuth();
      return;
    }
    if (a === "demo") {
      demo();
      return;
    }
    if (a === "start") {
      S.demo = false;
      S.user = null;
      S.data = null;
      S.groups = [];
      S.auth = "register";
      modal.close();
      renderAuth();
      return;
    }
    if (a === "menu") {
      $(".sidebar").classList.toggle("open");
      return;
    }
    if (a === "view") {
      S.view = el.dataset.value;
      if (
        ["activity", "reports", "balances", "settings", "group"].includes(
          S.view,
        )
      )
        await refresh(false);
      else shell();
      return;
    }
    if (a === "group") {
      await selectGroup(id);
      return;
    }
    if (a === "refresh") {
      await refresh();
      toast("حساب‌ها به‌روز شدند");
      return;
    }
    if (a === "logout") {
      if (!S.demo) await api("/auth/logout", "POST", {});
      S.demo = false;
      S.user = null;
      S.data = null;
      S.groups = [];
      S.selected = null;
      S.auth = "login";
      S.seq++;
      renderAuth();
      return;
    }
    if (a === "new-group") {
      newGroup();
      return;
    }
    if (a === "new-expense") {
      if (!S.demo) {
        el.disabled = true;
        await refresh();
      }
      expenseForm();
      return;
    }
    if (a === "edit-expense") {
      expenseForm(id);
      return;
    }
    if (a === "detail") {
      await detail(id);
      return;
    }
    if (a === "tab") {
      S.tab = el.dataset.value;
      renderContent();
      return;
    }
    if (a === "balances") {
      if (!S.demo) {
        el.disabled = true;
        await refresh();
      }
      balanceModal();
      return;
    }
    if (a === "settle") {
      settleForm(el.dataset);
      return;
    }
    if (a === "invite") {
      invite();
      return;
    }
    if (a === "copy-invite") {
      try {
        await navigator.clipboard.writeText($("#invite-link").value);
        toast("لینک دعوت کپی شد");
      } catch {
        $("#invite-link").select();
        toast("لینک را انتخاب کردم؛ آن را کپی کنید.");
      }
      return;
    }
    if (a === "export") {
      exportCSV();
      return;
    }
    if (a === "import") {
      importModal();
      return;
    }
    if (a === "import-template") {
      const d = S.data;
      const cell = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      download(
        "dong-import-template.csv",
        "\ufeff" +
          [
            [
              "date",
              "title",
              "amount",
              "currency",
              "payer",
              "participants",
              "category",
            ],
            [
              toJalali(today(), true),
              "نمونه — این ردیف را ویرایش کنید",
              "100000",
              d.group.currency,
              myGroupId(),
              d.members
                .filter((m) => !m.removed)
                .map((m) => m.id)
                .join("|"),
              "food",
            ],
          ]
            .map((r) => r.map(cell).join(","))
            .join("\r\n"),
        "text/csv;charset=utf-8",
      );
      return;
    }
    if (a === "itemize" || a === "convert") {
      const f = $("#expense-form"),
        c = f.elements.currency.value;
      const apply = (r) => {
        f.elements.amount.value = plain(r.amount, c);
        f.elements.note.value = (f.elements.note.value + "\n" + r.note)
          .trim()
          .slice(0, 2000);
        if (r.entries) {
          f.elements.mode.value = "exact";
          $$("[data-member]", f).forEach((x) => {
            const p = r.entries.find((p) => p.id === x.dataset.member);
            x.checked = !!p;
            $('[data-share="' + x.dataset.member + '"]', f).value = plain(
              p?.value || 0,
              c,
            );
          });
        }
        updateSplit();
      };
      if (a === "itemize")
        openBillHelper(
          S.data.members.filter((m) => !m.removed),
          c,
          apply,
        );
      else openConversion(c, apply);
      return;
    }
    if (a === "backup") {
      el.disabled = true;
      try {
        await backup();
      } finally {
        el.disabled = false;
      }
      return;
    }
    if (a === "delete-expense") {
      confirmModal(
        "حذف هزینه",
        "این هزینه از محاسبات گروه حذف می‌شود و حذف آن در فعالیت‌ها ثبت خواهد شد.",
        "confirm-delete",
        id,
      );
      return;
    }
    if (a === "delete-settlement") {
      confirmModal(
        "لغو تسویه",
        "اثر این پرداخت از حساب‌ها برداشته می‌شود.",
        "confirm-settlement",
        id,
      );
      return;
    }
    if (a === "stop-recurring") {
      confirmModal(
        "توقف تکرار",
        "هزینه‌های قبلی باقی می‌مانند؛ نوبت جدیدی ثبت نمی‌شود.",
        "confirm-recurring",
        id,
      );
      return;
    }
    if (a === "rotate-invite") {
      confirmModal(
        "تغییر لینک دعوت",
        "لینک فعلی باطل می‌شود؛ اعضای فعلی در گروه باقی می‌مانند.",
        "confirm-invite",
      );
      return;
    }
    if (a.startsWith("confirm-")) {
      if (!guard()) return;
      el.disabled = true;
      const endpoint =
        a === "confirm-delete"
          ? `expenses/${id}?version=${S.data.expenses.find((e) => e.id === id).version}`
          : a === "confirm-settlement"
            ? `settlements/${id}`
            : a === "confirm-recurring"
              ? `recurring/${id}`
              : "invite";
      await api(
        `/groups/${S.selected}/${endpoint}`,
        a === "confirm-invite" ? "POST" : "DELETE",
        a === "confirm-invite" ? {} : undefined,
      );
      modal.close();
      await refresh();
      toast("انجام شد");
      return;
    }
    if (a === "dismiss-join") {
      sessionStorage.removeItem("dong-invite");
      modal.close();
      return;
    }
    if (a === "join") {
      el.disabled = true;
      const data = await api("/join", "POST", {
        invite: sessionStorage.getItem("dong-invite"),
      });
      sessionStorage.removeItem("dong-invite");
      modal.close();
      await selectGroup(data.id);
      toast("به گروه پیوستید");
      return;
    }
    if (a === "recovery-done") {
      modal.close();
      await joinPending();
      return;
    }
  } catch (e) {
    el.disabled = false;
    toast(e.message);
  }
});
document.addEventListener("input", (e) => {
  peopleUI.input(e);
  if (e.target.id === "search") {
    S.search = e.target.value;
    renderList();
  }
  if (e.target.closest("#expense-form")) updateSplit();
});
document.addEventListener("change", async (e) => {
  peopleUI.change(e);
  if (e.target.id === "import-file") {
    pendingImport = null;
    const form = $("#import-form");
    try {
      const file = e.target.files[0];
      if (!file || file.size > 100000)
        throw Error("حداکثر حجم CSV صد کیلوبایت است");
      const rows = importRows(
        await file.text(),
        S.data.members.filter((m) => !m.removed),
      );
      pendingImport = { key: crypto.randomUUID(), rows };
      $("#import-preview").innerHTML =
        '<p class="positive">' +
        num(rows.length) +
        " هزینه آمادهٔ ثبت است:</p><ul>" +
        rows
          .map(
            (r) =>
              "<li>" +
              esc(r.title) +
              " — " +
              money(r.amount, r.currency) +
              "</li>",
          )
          .join("") +
        "</ul>";
      $(".error", form).textContent = "";
    } catch (error) {
      $(".error", form).textContent = error.message;
      $("#import-preview").textContent = "";
    }
  }
  if (e.target.id === "category-filter") {
    S.category = e.target.value;
    renderList();
  }
  if (e.target.closest("#expense-form")) updateSplit();
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.id) return;
  event.preventDefault();
  const err = $(".error", form),
    submit = $('[type="submit"]', form);
  if (submit?.disabled) return;
  if (err) err.textContent = "";
  if (submit) submit.disabled = true;
  try {
    if (await securityUI.submit(form)) return;
    if (await peopleUI.submit(form)) return;
    const f = new FormData(form);
    if (form.id === "auth-form") {
      const result = await api(
        "/auth/" + S.auth,
        "POST",
        Object.fromEntries(f),
      );
      if (S.auth === "recover") {
        S.auth = "login";
        renderAuth();
        showRecovery(
          result.recovery,
          "رمز عبور تغییر کرد؛ کلید جدید را نگه دارید.",
        );
        return;
      }
      S.user = result.user;
      S.demo = false;
      S.selected = null;
      S.view = "home";
      await refresh();
      if (result.recovery) showRecovery(result.recovery);
      else await joinPending();
      return;
    }
    if (!guard()) return;
    if (form.id === "group-form") {
      const result = await api("/groups", "POST", Object.fromEntries(f));
      modal.close();
      await selectGroup(result.id);
      invite();
      return;
    }
    if (form.id === "expense-form") {
      const b = readExpense(form);
      split(b.amount, b.mode, b.entries);
      if (b.payers.reduce((s, p) => s + p.value, 0) !== b.amount)
        throw Error("جمع پرداخت‌ها باید برابر هزینه باشد");
      const file = f.get("receipt");
      if (file?.size) {
        if (file.size > 250000)
          throw Error("تصویر رسید باید کوچک‌تر از ۲۵۰ کیلوبایت باشد");
        b.receipt = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
      }
      if (
        f.get("saveDefault") &&
        !["equal", "percent", "shares"].includes(b.mode)
      )
        throw Error(
          "برای پیش‌فرض گروه از تقسیم مساوی، درصدی یا سهمی استفاده کنید",
        );
      await api(
        `/groups/${S.selected}/expenses${editing ? "/" + editing.id : ""}`,
        editing ? "PUT" : "POST",
        b,
      );
      if (f.get("saveDefault")) {
        try {
          await api(`/groups/${S.selected}/defaults`, "PUT", {
            mode: b.mode,
            entries: b.entries,
          });
        } catch {
          toast("هزینه ثبت شد، اما ذخیرهٔ پیش‌فرض انجام نشد.");
        }
      }
      modal.close();
      await refresh();
      toast("هزینه با موفقیت ثبت شد");
      return;
    }
    if (form.id === "import-form") {
      if (!pendingImport) throw Error("ابتدا فایل معتبر انتخاب کنید");
      await api("/groups/" + S.selected + "/import", "POST", pendingImport);
      modal.close();
      await refresh();
      toast("هزینه‌های فایل وارد شدند");
      return;
    }
    if (form.id === "settle-form") {
      const b = Object.fromEntries(f);
      b.amount = minor(b.amount, b.currency);
      b.requestId = settlementRequestId;
      b.date = fromJalali(b.date);
      await api(`/groups/${S.selected}/settlements`, "POST", b);
      modal.close();
      await refresh();
      toast("تسویه ثبت شد");
      return;
    }
    if (form.id === "comment-form") {
      const id = form.dataset.id;
      await api(`/groups/${S.selected}/expenses/${id}/comments`, "POST", {
        body: f.get("body"),
      });
      await detail(id);
      return;
    }
    if (form.id === "profile-form") {
      await api("/profile", "PUT", { name: f.get("name") });
      await refresh();
      toast("نام شما ذخیره شد");
      return;
    }
    if (form.id === "group-settings") {
      await api("/groups/" + S.selected, "PUT", {
        name: f.get("name"),
        archived: !!f.get("archived"),
      });
      await refresh();
      toast("تنظیمات ذخیره شد");
      return;
    }
  } catch (e) {
    if (err) err.textContent = e.message;
    else toast(e.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});
function showRecovery(key, title = "حساب شما آماده است!") {
  showModal(
    title,
    `<p>این کلید برای بازیابی حساب شماست. آن را در مدیر رمز عبور یا جای امن ذخیره کنید؛ دوباره نمایش داده نمی‌شود.</p><div class="recovery" style="margin:20px 0">${esc(key)}</div><p class="help">هر کسی این کلید را داشته باشد می‌تواند رمز عبور شما را تغییر دهد.</p><div class="form-actions"><button class="btn primary" data-action="recovery-done">کلید را ذخیره کردم</button></div>`,
  );
}
function demo() {
  invalidateCache();
  S.overview = null;
  S.demo = true;
  S.user = { id: "me", name: "یاشار", email: "demo@example.com" };
  S.groups = [
    {
      id: "demo",
      name: "سفر به شمال",
      emoji: "🌴",
      currency: "IRT",
      owner: "me",
      member_count: 4,
      archived: 0,
    },
  ];
  S.selected = "demo";
  S.view = "home";
  S.people = [
    {
      id: "demo-sara",
      name: "سارا",
      currency: "IRT",
      is_owner: true,
      shared: false,
      archived: 0,
      balances: { IRT: 450000 },
      entry_count: 1,
    },
    {
      id: "demo-arman",
      name: "آرمان",
      currency: "IRT",
      is_owner: true,
      shared: false,
      archived: 0,
      balances: { IRT: -180000 },
      entry_count: 1,
    },
  ];
  S.person = null;
  S.personId = null;
  S.search = "";
  S.category = "";
  S.tab = "expenses";
  const members = [
    { id: "me", name: "یاشار" },
    { id: "s", name: "سارا" },
    { id: "a", name: "آرمان" },
    { id: "m", name: "مریم" },
  ];
  const make = (id, title, n, payer, category, date) => ({
    id,
    title,
    amount: n,
    currency: "IRT",
    category,
    date,
    creator: payer,
    payers: [{ id: payer, value: n }],
    allocations: split(
      n,
      "equal",
      members.map((m) => ({ id: m.id, value: 1 })),
    ),
    note: "اطلاعات نمونه برای آشنایی با دنگشار",
    mode: "equal",
    version: 1,
  });
  S.data = {
    group: S.groups[0],
    members,
    expenses: [
      make("e1", "شام رستوران کنار دریا", 1480000, "me", "food", today()),
      make("e2", "خرید تنقلات و صبحانه", 620000, "s", "shopping", today()),
      make("e3", "اجارهٔ ویلای جنگلی", 4800000, "me", "home", today()),
      make("e4", "بنزین و عوارض جاده", 380000, "a", "travel", today()),
      make("e5", "کافهٔ بین راه", 460000, "m", "food", today()),
    ],
    settlements: [],
    recurring: [],
    activity: [
      {
        name: "یاشار",
        message: "هزینهٔ «شام رستوران کنار دریا» را ثبت کرد",
        created_at: today(),
      },
      { name: "سارا", message: "به گروه پیوست", created_at: today() },
    ],
  };
  shell();
}
async function init() {
  const authHash = new URLSearchParams(location.hash.slice(1));
  for (const kind of ["reset", "verify"]) {
    if (authHash.has(kind)) {
      renderAuth();
      securityUI.showLink(kind, authHash.get(kind));
      return;
    }
  }
  const statement = new URLSearchParams(location.hash.slice(1)).get(
    "statement",
  );
  if (statement) {
    await renderPublicStatement(statement);
    return;
  }
  const personInvite = new URLSearchParams(location.search).get(
    "person_invite",
  );
  if (personInvite) {
    sessionStorage.setItem("dong-person-invite", personInvite);
    history.replaceState({}, "", location.pathname);
  }
  const inviteToken = new URLSearchParams(location.search).get("invite");
  if (inviteToken) {
    sessionStorage.setItem("dong-invite", inviteToken);
    history.replaceState({}, "", location.pathname);
  }
  try {
    await refresh();
    await joinPending();
  } catch {
    renderAuth();
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}
// Refresh only while the page is visible and no form is open; never overwrite an in-progress edit.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.user && !S.demo && !modal.open)
    refresh().catch(() => toast("ارتباط برقرار نشد؛ دوباره تازه‌سازی کنید."));
});
window.addEventListener("offline", () =>
  toast("اتصال قطع شد؛ برای ثبت و دریافت حساب‌ها دوباره آنلاین شوید."),
);
window.addEventListener("online", () => {
  if (S.user && !S.demo && !modal.open) refresh().catch(() => {});
});
init();
