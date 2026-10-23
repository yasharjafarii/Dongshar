import { dateInput, fromJalali, toJalali } from "./jalali.js";
import { currencies, minor, latin, split } from "./ledger.js";

export function createPeopleUI(ctx) {
  const {
    S,
    overallBanner,
    itemSection,
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
  } = ctx;
  const $ = (s, r = document) => r.querySelector(s);
  let editing = null,
    requestId = null,
    newPersonId = null;
  const themePicker = () => window.dongTheme.controls();
  const balanceText = (v, c) =>
    `${money(Math.abs(v), c)} <span class="small">${v > 0 ? "طلب شما" : v < 0 ? "بدهی شما" : "تسویه"}</span>`;
  const people = () => S.overview || S.people;
  function personCard(p) {
    return `<button class="person-card card" data-action="${p.accounts && p.accounts.length !== 1 ? "overall-person" : "person-open"}" data-id="${p.accounts?.length === 1 ? p.accounts[0].id : p.id}"><div class="between"><div class="flex">${avatar(p.name)}<div><h3>${esc(p.name)}</h3><p class="small muted">${p.accounts ? "شخصی و گروهی · ماندهٔ کلی" : p.shared ? "حساب مشترک آنلاین" : "ثبت دستی · فقط برای شما"}${p.archived ? " · بایگانی" : ""}</p></div></div>${icon("arrow")}</div><div class="person-balances">${
      Object.entries(p.balances)
        .filter(([, v]) => v !== 0)
        .map(
          ([c, v]) =>
            `<div class="${v < 0 ? "negative" : "positive"}">${balanceText(v, c)}</div>`,
        )
        .join("") || '<span class="muted small">حسابی باز نمانده است ✓</span>'
    }</div><div class="small muted">${p.accounts ? `${num(p.accounts.length)} دفتر شخصی · ${num(p.groups.length)} گروه · ماندهٔ کلی` : `${num(p.entry_count)} تراکنش`}</div></button>`;
  }
  function renderHome(target) {
    const active = people().filter(
        (p) => !p.archived || Object.values(p.balances).some(Boolean),
      ),
      cs = [
        ...new Set(["IRT", ...active.flatMap((p) => Object.keys(p.balances))]),
      ],
      c = cs.includes(S.personalCurrency) ? S.personalCurrency : "IRT";
    S.personalCurrency = c;
    const owed = active.reduce(
        (n, p) => n + Math.max(0, p.balances[c] || 0),
        0,
      ),
      owe = active.reduce((n, p) => n + Math.max(0, -(p.balances[c] || 0)), 0),
      net = owed - owe;
    target.innerHTML = `<div class="intro between"><div><h1>سلام ${esc(S.user.name)}، حساب‌ها چطورند؟</h1><p>کل حساب شما با هر نفر؛ شخصی و همهٔ گروه‌ها.</p></div><button class="btn primary" data-action="person-new">${icon("plus")} افزودن دوست</button></div><div class="between overview-filter"><p class="small muted">جمع ماندهٔ هر فرد در حساب شخصی و تمام گروه‌ها؛ ارزها جدا محاسبه می‌شوند.</p><label class="flex small">واحد نمایش<select id="personal-currency">${cs.map((code) => `<option value="${code}" ${code === c ? "selected" : ""}>${esc(currencies[code].label)}</option>`).join("")}</select></label></div><section class="stats"><div class="stat featured"><div class="label">${icon("wallet")} خالص کل حساب‌ها</div><div class="value">${money(Math.abs(net), c)}</div><div class="small">${net > 0 ? "در مجموع طلبکارید" : net < 0 ? "در مجموع بدهکارید" : "ماندهٔ خالص صفر است"} · ${num(active.length)} نفر</div></div><div class="stat"><div class="label">${icon("arrow")} مجموع طلب شما</div><div class="value positive">${money(owed, c)}</div><div class="small muted">مبالغی که باید دریافت کنید</div></div><div class="stat"><div class="label">${icon("down")} مجموع بدهی شما</div><div class="value negative">${money(owe, c)}</div><div class="small muted">مبالغی که باید پرداخت کنید</div></div></section><div class="between section-heading"><h2>حساب با دوستان</h2><button class="btn soft small" data-action="view" data-value="people">همهٔ افراد ←</button></div>${active.length ? `<div class="people-grid">${active.slice(0, 6).map(personCard).join("")}</div>` : `<section class="card empty"><div class="big">🤝</div><h3>اولین حساب فردی‌ات را بساز</h3><p>فقط اسم دوستت کافی است؛ نیازی به دعوت یا ثبت‌نام او نیست.</p><button class="btn primary" data-action="person-new">افزودن اولین دوست</button></section>`}<section class="card home-groups"><div class="between"><div><h2>حساب‌های گروهی</h2><p class="muted small">برای سفر، خانه و جمع‌های چندنفره · ${num(S.groups.length)} گروه</p></div><button class="btn secondary" data-action="${S.groups.length ? "view" : "new-group"}" ${S.groups.length ? 'data-value="groups"' : ""}>${S.groups.length ? "مشاهدهٔ گروه‌ها" : "ساخت اولین گروه"}</button></div></section>`;
  }
  function renderPeople(target) {
    target.innerHTML = `<div class="intro between"><div><h1>دوستان و حساب‌های فردی</h1><p>ماندهٔ کلی هر نفر و تفکیک دفترهای شخصی و گروه‌ها.</p></div><button class="btn primary" data-action="person-new">${icon("plus")} افزودن دوست</button></div><div class="people-toolbar"><input id="people-search" type="search" aria-label="جست‌وجوی دوستان" placeholder="نام دوستت را جست‌وجو کن…" value="${esc(S.peopleSearch || "")}"><select id="people-filter" aria-label="وضعیت حساب دوستان">${[
      ["active", "حساب‌های فعال"],
      ["credit", "طلبکارم"],
      ["debt", "بدهکارم"],
      ["settled", "تسویه‌شده"],
      ["archived", "بایگانی‌شده"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${(S.peopleFilter || "active") === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></div><div id="people-list" class="people-grid"></div>`;
    renderPeopleList();
  }
  function renderPeopleList() {
    const list = $("#people-list");
    if (!list) return;
    const rows = people()
      .filter((p) =>
        p.name.toLowerCase().includes((S.peopleSearch || "").toLowerCase()),
      )
      .filter((p) => {
        const f = S.peopleFilter || "active",
          v = Object.values(p.balances);
        return f === "archived"
          ? p.archived
          : (!p.archived || Object.values(p.balances).some(Boolean)) &&
              (f === "active" ||
                (f === "credit" && v.some((n) => n > 0)) ||
                (f === "debt" && v.some((n) => n < 0)) ||
                (f === "settled" && v.every((n) => n === 0)));
      });
    list.innerHTML =
      rows.map(personCard).join("") ||
      '<div class="card empty"><h3>کسی در این فهرست نیست</h3><p class="small">یک دوست اضافه کن یا فیلتر را تغییر بده.</p></div>';
  }
  function renderAccount(target) {
    const d = S.person;
    if (!d) {
      target.innerHTML =
        '<div class="empty">حساب پیدا نشد؛ از فهرست دوستان انتخاب کنید.</div>';
      return;
    }
    const a = d.account,
      bs = Object.keys(d.balances).length ? d.balances : { [a.currency]: 0 };
    target.innerHTML = `<div class="intro between"><div><button class="small muted" data-action="view" data-value="people">→ بازگشت به دوستان</button><div class="flex">${avatar(a.name)}<h1>حساب با ${esc(a.name)}</h1></div><p>${a.shared ? "این دفتر برای هر دو نفر مشترک است؛ هرکس ماندهٔ خودش را می‌بیند." : "دوست شما نیازی به حساب دنگشار ندارد؛ این دفتر فقط برای شماست."}</p></div><div class="flex">${a.is_owner ? `<button class="btn secondary" data-action="person-settings">${icon("settings")} ویرایش دوست</button>` : ""}<button class="btn primary" data-action="person-entry" ${a.archived ? "disabled" : ""}>${icon("plus")} ثبت تراکنش</button></div></div>${a.archived ? '<div class="notice">این حساب بایگانی شده است. سازنده می‌تواند آن را دوباره فعال کند.</div>' : ""}${overallBanner(S.overview?.find((p) => p.accounts.some((x) => x.id === a.id)))}<div class="personal-balance-grid">${Object.entries(
      bs,
    )
      .map(
        ([c, v]) =>
          `<section class="stat"><div class="label">ماندهٔ دفتر شخصی · ${esc(currencies[c].label)}</div><div class="value ${v < 0 ? "negative" : "positive"}">${money(Math.abs(v), c)}</div><div class="between"><span class="small muted">${v > 0 ? `${esc(a.name)} به شما بدهکار است` : v < 0 ? `به ${esc(a.name)} بدهکارید` : "حساب تسویه است ✓"}</span>${v && !a.archived ? `<button class="btn soft small" data-action="person-settle" data-currency="${c}">ثبت تسویه</button>` : ""}</div></section>`,
      )
      .join(
        "",
      )}</div><div class="quick-actions"><button class="btn secondary" data-action="person-lend" ${a.archived ? "disabled" : ""}>${icon("arrow")} ثبت طلب من</button><button class="btn secondary" data-action="person-borrow" ${a.archived ? "disabled" : ""}>${icon("down")} ثبت بدهی من</button><button class="btn secondary" data-action="person-expense" ${a.archived ? "disabled" : ""}>${icon("wallet")} هزینهٔ مشترک</button>${a.is_owner && !a.shared && !a.archived ? '<button class="btn soft" data-action="person-share">اتصال اختیاری به حساب دوست</button>' : ""}<button class="btn secondary" data-action="statement-person">لینک مشاهده بدون عضویت</button><button class="btn secondary" data-action="person-export">${icon("file")} خروجی CSV</button></div><div class="content-grid"><section class="card"><div class="card-head"><h2>دفتر حساب ${esc(a.name)}</h2><span class="small muted">${num(d.entries.length)} تراکنش</span></div><div class="filter"><div class="search">${icon("search")}<input id="person-search" aria-label="جست‌وجوی تراکنش فردی" value="${esc(S.personSearch || "")}" placeholder="جست‌وجوی عنوان و یادداشت…"></div></div><div id="person-entries"></div></section><aside class="stack"><section class="card"><div class="card-head"><h2>دربارهٔ این حساب</h2></div><div class="card-body"><p class="small">${a.shared ? `متصل به حساب ${esc(a.peer_name)}؛ تراکنش‌های ثبت‌شده برای هر دو طرف قابل مشاهده‌اند.` : "ثبت دستی؛ هیچ دعوت یا پیامی برای این شخص ارسال نشده است."}</p>${a.personal_note ? `<p class="small wrap personal-note">${esc(a.personal_note)}</p><span class="help">یادداشت خصوصی شما</span>` : ""}</div></section><section class="card"><div class="card-head"><h2>آخرین تغییرات</h2></div>${d.activity
      .slice(0, 12)
      .map(
        (e) =>
          `<div class="activity-row"><div><p><strong>${esc(e.name)}</strong> ${esc(e.message)}</p><small>${day(e.created_at)}</small></div></div>`,
      )
      .join("")}</section></aside></div>`;
    const person = S.overview?.find((p) =>
      p.accounts.some((x) => x.id === a.id),
    );
    if (person && !S.demo)
      target
        .querySelector(".quick-actions")
        .insertAdjacentHTML("afterend", itemSection(person.id));
    renderEntries();
  }
  function renderEntries() {
    const list = $("#person-entries");
    if (!list) return;
    const rows = S.person.entries.filter((e) =>
      `${e.title} ${e.note}`
        .toLowerCase()
        .includes((S.personSearch || "").toLowerCase()),
    );
    list.innerHTML =
      rows
        .map(
          (e) =>
            `<button class="expense-row" data-action="person-detail" data-id="${e.id}"><div class="expense-icon ${e.kind === "payment" ? "home" : ""}">${e.kind === "expense" ? "🧾" : "⇄"}</div><div class="expense-info"><strong>${esc(e.title)}</strong><span>${day(e.date)} · ${e.paid_by === "self" ? "شما" : esc(S.person.account.name)} پرداخت کرد</span></div><div class="expense-price"><strong>${money(e.amount, e.currency)}</strong><span class="${e.my_delta < 0 ? "negative" : "positive"}">${e.my_delta === 0 ? "بدون اثر بر مانده" : `${e.my_delta > 0 ? "+" : "−"} ${num(Math.abs(e.my_delta) / 10 ** currencies[e.currency].digits)} ماندهٔ شما`}</span></div></button>`,
        )
        .join("") ||
      '<div class="empty"><h3>تراکنشی پیدا نشد</h3><p class="small">پرداخت‌ها، طلب‌ها و هزینه‌های مشترک را اینجا ثبت کنید.</p></div>';
  }
  async function open(id) {
    S.personId = id;
    S.view = "person";
    S.personSearch = "";
    if (S.demo) {
      const p = S.people.find((p) => p.id === id),
        v = p.balances.IRT;
      S.person = {
        account: { ...p, owner: S.user.id, personal_note: "" },
        balances: p.balances,
        entries: [
          {
            id: "demo-entry",
            title: "قرض دوستانه",
            kind: "payment",
            amount: Math.abs(v),
            currency: "IRT",
            paid_by: v > 0 ? "self" : "friend",
            my_share: 0,
            my_delta: v,
            date: today(),
            note: "اطلاعات نمونه",
            creator: S.user.id,
            version: 1,
          },
        ],
        activity: [],
      };
    }
    await refresh(false);
  }
  function newPerson() {
    if (!guard()) return;
    newPersonId = crypto.randomUUID();
    showModal(
      "افزودن دوست بدون دعوت",
      `<form id="personal-new-form"><p class="muted small form-intro">فقط نام کافی است. این حساب خصوصی است؛ برای دوست شما حساب کاربری ساخته نمی‌شود.</p><div class="field"><label for="person-name">نام دوست</label><input id="person-name" name="name" required maxlength="60" placeholder="مثلاً سارا"></div><div class="field"><label for="person-currency">واحد پول پیش‌فرض</label><select id="person-currency" name="currency">${currencyOptions("IRT")}</select></div><div class="field"><label for="person-note">یادداشت خصوصی (اختیاری)</label><textarea id="person-note" name="note" maxlength="1000" placeholder="توضیحی برای خودت…"></textarea></div>${actions("افزودن دوست")}</form>`,
    );
  }
  function settings() {
    if (!guard()) return;
    const a = S.person.account;
    showModal(
      "ویرایش دوست",
      `<form id="personal-settings-form"><div class="field"><label for="person-name">نام دوست</label><input id="person-name" name="name" value="${esc(a.name)}" required maxlength="60"></div><div class="field"><label for="person-note">یادداشت خصوصی</label><textarea id="person-note" name="note" maxlength="1000">${esc(a.personal_note)}</textarea></div><label class="flex"><input type="checkbox" name="archived" ${a.archived ? "checked" : ""}> بایگانی این حساب</label><p class="help">تاریخچه حفظ می‌شود. حساب بایگانی‌شده از جمع صفحهٔ اصلی کنار گذاشته می‌شود.</p>${actions("ذخیرهٔ تغییرات")}</form>`,
    );
  }
  function entryForm(e = null, preset = {}) {
    if (!guard()) return;
    editing = e;
    requestId = crypto.randomUUID();
    const a = S.person.account,
      c = e?.currency || preset.currency || a.currency,
      kind = e?.kind || preset.kind || "expense",
      paid = e?.paid_by || preset.paid_by || "self";
    showModal(
      e
        ? "ویرایش تراکنش"
        : preset.settle
          ? "ثبت تسویهٔ فردی"
          : "ثبت تراکنش با " + a.name,
      `<form id="personal-entry-form">${preset.settle ? '<div class="notice">فقط پرداخت انجام‌شده را ثبت کنید؛ این فرم پول جابه‌جا نمی‌کند.</div>' : ""}<div class="field"><label for="personal-title">عنوان تراکنش</label><input id="personal-title" name="title" required maxlength="120" value="${esc(e?.title || preset.title || "")}" placeholder="مثلاً شام یا قرض دوستانه"></div><div class="fields"><div class="field"><label for="personal-kind">نوع تراکنش</label><select id="personal-kind" name="kind"><option value="expense" ${kind === "expense" ? "selected" : ""}>هزینهٔ مشترک</option><option value="payment" ${kind === "payment" ? "selected" : ""}>پرداخت / دریافت وجه</option></select></div><div class="field"><label for="personal-payer">چه کسی پرداخت کرد؟</label><select id="personal-payer" name="paid_by"><option value="self" ${paid === "self" ? "selected" : ""}>من</option><option value="friend" ${paid === "friend" ? "selected" : ""}>${esc(a.name)}</option></select></div><div class="field"><label for="personal-amount">مبلغ کل</label><input id="personal-amount" name="amount" inputmode="decimal" required value="${e ? plain(e.amount, c) : preset.amount ? plain(preset.amount, c) : ""}"></div><div class="field"><label for="personal-entry-currency">واحد پول</label><select id="personal-entry-currency" name="currency">${currencyOptions(c)}</select></div></div><div id="personal-split-fields"><div class="fields"><div class="field"><label for="personal-split">روش تقسیم</label><select id="personal-split" name="split"><option value="equal" ${!e ? "selected" : ""}>مساوی</option><option value="exact" ${e ? "selected" : ""}>مبلغ سهم من</option><option value="percent">درصد سهم من</option></select></div><div class="field" id="personal-share-field"><label for="personal-share">سهم من (مبلغ یا درصد)</label><input id="personal-share" name="share" inputmode="decimal" value="${e ? plain(e.my_share, c) : "50"}"></div></div></div><div id="personal-preview" class="split-preview" aria-live="polite"></div>${dateInput("personal-date", e?.date || today())}<div class="field"><label for="personal-entry-note">یادداشت تراکنش</label><textarea id="personal-entry-note" name="note" maxlength="2000">${esc(e?.note || "")}</textarea><p class="help">اگر این حساب را مشترک کنید، یادداشت تراکنش هم برای دوست شما نمایش داده می‌شود.</p></div>${actions(e ? "ذخیرهٔ تغییرات" : "ثبت تراکنش")}</form>`,
    );
    updatePreview();
  }
  function readEntry(form) {
    const f = new FormData(form),
      c = f.get("currency"),
      amount = minor(f.get("amount"), c),
      kind = f.get("kind");
    let my_share = 0;
    if (kind === "expense") {
      if (f.get("split") === "equal")
        my_share = split(amount, "equal", [
          { id: "self", value: 1 },
          { id: "friend", value: 1 },
        ])[0].value;
      else if (f.get("split") === "exact") my_share = minor(f.get("share"), c);
      else {
        const p = Number(latin(f.get("share")));
        my_share = split(amount, "percent", [
          { id: "self", value: p },
          { id: "friend", value: 100 - p },
        ])[0].value;
      }
      if (my_share > amount)
        throw Error("سهم شما نمی‌تواند از کل مبلغ بیشتر باشد");
    }
    return {
      requestId,
      kind,
      title: f.get("title"),
      amount,
      currency: c,
      paid_by: f.get("paid_by"),
      my_share,
      date: fromJalali(f.get("date")),
      note: f.get("note"),
      version: editing?.version,
    };
  }
  function updatePreview() {
    const f = $("#personal-entry-form");
    if (!f) return;
    $("#personal-split-fields").classList.toggle(
      "hidden",
      f.elements.kind.value !== "expense",
    );
    $("#personal-share-field").classList.toggle(
      "hidden",
      f.elements.split.value === "equal",
    );
    try {
      const b = readEntry(f),
        delta =
          b.kind === "payment"
            ? b.paid_by === "self"
              ? b.amount
              : -b.amount
            : (b.paid_by === "self" ? b.amount : 0) - b.my_share;
      $("#personal-preview").innerHTML =
        (b.kind === "expense"
          ? `سهم شما: ${money(b.my_share, b.currency)} · سهم دوست: ${money(b.amount - b.my_share, b.currency)}<br>`
          : "") +
        `اثر روی ماندهٔ شما: ${delta < 0 ? "−" : "+"}${money(Math.abs(delta), b.currency)}`;
    } catch (error) {
      $("#personal-preview").textContent = f.elements.amount.value
        ? error.message
        : "مبلغ را وارد کنید تا اثر تراکنش را ببینید.";
    }
  }
  function detail(id) {
    const e = S.person.entries.find((e) => e.id === id);
    showModal(
      e.title,
      `<div class="detail-total">${money(e.amount, e.currency)}</div><p class="small muted">${day(e.date)} · ${e.kind === "expense" ? "هزینهٔ مشترک" : "پرداخت / دریافت وجه"}</p><div class="detail-grid"><div>پرداخت‌کننده: ${e.paid_by === "self" ? "شما" : esc(S.person.account.name)}</div><div>${e.kind === "expense" ? `سهم شما: ${money(e.my_share, e.currency)}` : e.paid_by === "self" ? "از شما به دوست" : "از دوست به شما"}</div></div><p class="wrap personal-note">${esc(e.note)}</p>${e.creator === S.user.id && !S.person.account.archived ? `<div class="flex"><button class="btn secondary" data-action="person-edit-entry" data-id="${e.id}">ویرایش</button><button class="btn danger" data-action="person-delete-entry" data-id="${e.id}">حذف تراکنش</button></div>` : '<p class="help">هر نفر فقط می‌تواند تراکنش‌هایی را که خودش ثبت کرده تغییر دهد.</p>'}`,
    );
  }
  async function share() {
    if (!guard()) return;
    showModal(
      "اتصال اختیاری حساب",
      `<p>افزودن دوست به دعوت نیاز ندارد. فقط اگر می‌خواهید او هم این دفتر را ببیند و تراکنش ثبت کند، لینک اتصال بسازید.</p><div class="notice" style="margin-top:16px">با پذیرش لینک، تمام تراکنش‌های قبلی و یادداشت‌های آن‌ها نیز مشترک می‌شوند. یادداشت خصوصی دوست نمایش داده نمی‌شود. لینک را فقط برای همان شخص بفرستید.</div><div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn primary" data-action="person-make-link">ساخت لینک اتصال</button></div>`,
    );
  }
  async function pendingJoin() {
    const invite = sessionStorage.getItem("dong-person-invite");
    if (!invite) return false;
    showModal(
      "اتصال به حساب یک دوست",
      `<p>با تأیید، به یک دفتر حساب دونفره متصل می‌شوید؛ تراکنش‌های قبلی آن را می‌بینید و می‌توانید تراکنش‌های خودتان را اضافه کنید.</p><div class="form-actions"><button class="btn secondary" data-action="person-dismiss-join">فعلاً نه</button><button class="btn primary" data-action="person-join">پذیرش و اتصال حساب</button></div>`,
    );
    return true;
  }
  async function click(el) {
    const action = el.dataset.action;
    if (!action.startsWith("person-")) return false;
    const id = el.dataset.id;
    if (action === "person-open") await open(id);
    else if (action === "person-new") newPerson();
    else if (action === "person-settings") settings();
    else if (action === "person-detail") detail(id);
    else if (action === "person-edit-entry")
      entryForm(S.person.entries.find((e) => e.id === id));
    else if (
      [
        "person-entry",
        "person-expense",
        "person-lend",
        "person-borrow",
        "person-settle",
      ].includes(action)
    ) {
      if (!guard()) return true;
      el.disabled = true;
      await refresh();
      el.disabled = false;
      if (action === "person-settle") {
        const c = el.dataset.currency,
          v = S.person.balances[c] || 0;
        if (!v) {
          toast("این حساب قبلاً تسویه شده است");
          return true;
        }
        entryForm(null, {
          kind: "payment",
          paid_by: v > 0 ? "friend" : "self",
          currency: c,
          amount: Math.abs(v),
          title: "تسویه حساب",
          settle: true,
        });
      } else
        entryForm(
          null,
          action === "person-lend"
            ? {
                kind: "payment",
                paid_by: "self",
                title: "قرض به " + S.person.account.name,
              }
            : action === "person-borrow"
              ? {
                  kind: "payment",
                  paid_by: "friend",
                  title: "قرض از " + S.person.account.name,
                }
              : {},
        );
    } else if (action === "person-delete-entry")
      showModal(
        "حذف تراکنش",
        `<p>اثر این تراکنش از مانده حذف می‌شود و در تاریخچه ثبت خواهد شد.</p><div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn danger" data-action="person-confirm-delete" data-id="${id}">تأیید حذف</button></div>`,
      );
    else if (action === "person-confirm-delete") {
      if (!guard()) return true;
      el.disabled = true;
      const e = S.person.entries.find((e) => e.id === id);
      await api(
        `/people/${S.personId}/entries/${id}?version=${e.version}`,
        "DELETE",
      );
      modal.close();
      await refresh();
      toast("تراکنش حذف شد");
    } else if (action === "person-share") await share();
    else if (action === "person-make-link") {
      if (!guard()) return true;
      el.disabled = true;
      const r = await api("/people/" + S.personId + "/invite", "POST", {});
      showModal(
        "لینک اتصال دوست",
        `<p class="small muted">فقط یک حساب می‌تواند این لینک را بپذیرد. پس از پذیرش، لینک مصرف می‌شود.</p><label for="person-link">لینک اتصال</label><input id="person-link" readonly dir="ltr" value="${esc(location.origin + "/?person_invite=" + r.invite)}"><div class="form-actions"><button class="btn danger" data-action="person-revoke-link">باطل کردن لینک</button><button class="btn primary" data-action="person-copy-link">کپی لینک</button></div>`,
      );
    } else if (action === "person-copy-link") {
      try {
        await navigator.clipboard.writeText($("#person-link").value);
        toast("لینک کپی شد");
      } catch {
        $("#person-link").select();
        toast("لینک را کپی کنید");
      }
    } else if (action === "person-revoke-link") {
      await api("/people/" + S.personId + "/invite", "DELETE");
      modal.close();
      toast("لینک قبلی باطل شد");
    } else if (action === "person-dismiss-join") {
      sessionStorage.removeItem("dong-person-invite");
      modal.close();
    } else if (action === "person-join") {
      el.disabled = true;
      const r = await api("/people/join", "POST", {
        invite: sessionStorage.getItem("dong-person-invite"),
      });
      sessionStorage.removeItem("dong-person-invite");
      modal.close();
      await open(r.id);
      toast("حساب مشترک شد");
    } else if (action === "person-export") {
      const cell = (s) =>
        '"' +
        String(s ?? "")
          .replace(/^[\s]*[=+@-]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const rows = [
        [
          "عنوان",
          "نوع",
          "تاریخ",
          "مبلغ",
          "واحد",
          "پرداخت‌کننده",
          "سهم من",
          "اثر بر مانده من",
          "یادداشت",
        ],
        ...S.person.entries.map((e) => [
          e.title,
          e.kind === "expense" ? "هزینه" : "پرداخت",
          toJalali(e.date, true),
          plain(e.amount, e.currency),
          e.currency,
          e.paid_by === "self" ? S.user.name : S.person.account.name,
          e.kind === "expense" ? plain(e.my_share, e.currency) : "",
          plain(e.my_delta, e.currency),
          e.note,
        ]),
      ];
      download(
        "dong-personal.csv",
        "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
        "text/csv;charset=utf-8",
      );
    }
    return true;
  }
  async function submit(form) {
    if (!form.id.startsWith("personal-")) return false;
    if (!guard()) return true;
    const f = new FormData(form);
    if (form.id === "personal-new-form") {
      const r = await api("/people", "POST", {
        requestId: newPersonId,
        ...Object.fromEntries(f),
      });
      modal.close();
      await open(r.id);
      toast("دوست اضافه شد؛ بدون ارسال دعوت");
    } else if (form.id === "personal-entry-form") {
      const b = readEntry(form);
      await api(
        `/people/${S.personId}/entries${editing ? "/" + editing.id : ""}`,
        editing ? "PUT" : "POST",
        b,
      );
      modal.close();
      await refresh();
      toast("تراکنش ثبت شد");
    } else if (form.id === "personal-settings-form") {
      await api("/people/" + S.personId, "PUT", {
        name: f.get("name"),
        note: f.get("note"),
        archived: !!f.get("archived"),
      });
      modal.close();
      await refresh();
      toast("اطلاعات دوست ذخیره شد");
    }
    return true;
  }
  function input(e) {
    if (e.target.id === "people-search") {
      S.peopleSearch = e.target.value;
      renderPeopleList();
    }
    if (e.target.id === "person-search") {
      S.personSearch = e.target.value;
      renderEntries();
    }
    if (e.target.closest("#personal-entry-form")) updatePreview();
  }
  function change(e) {
    if (e.target.id === "personal-currency") {
      S.personalCurrency = e.target.value;
      renderHome($("#content"));
    }
    if (e.target.id === "people-filter") {
      S.peopleFilter = e.target.value;
      renderPeopleList();
    }
    if (e.target.closest("#personal-entry-form")) updatePreview();
  }
  return {
    themePicker,
    renderHome,
    renderPeople,
    renderAccount,
    pendingJoin,
    click,
    submit,
    input,
    change,
  };
}
