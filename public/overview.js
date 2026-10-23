export function createOverviewUI({ S, money, esc, showModal, itemSection }) {
  const values = (bs) =>
    Object.entries(bs)
      .map(
        ([c, n]) =>
          `<div class="${n < 0 ? "negative" : "positive"}">${money(Math.abs(n), c)} <small>${n > 0 ? "طلب شما" : n < 0 ? "بدهی شما" : "تسویه"}</small></div>`,
      )
      .join("") || '<span class="muted">تسویه</span>';
  function details(p) {
    return `<p class="notice">جمع حساب شخصی و پیشنهاد تسویهٔ شما با این فرد در همهٔ گروه‌ها؛ ارزها جدا هستند. گروه‌های بایگانی‌شده هم محاسبه می‌شوند.</p><div class="stat"><h3>ماندهٔ کلی</h3>${values(p.balances)}</div><button class="btn primary" data-action="settle-all" data-person="${esc(p.id)}">تسویهٔ کلی با این فرد</button><h3>دفترهای شخصی</h3>${p.accounts.map((a) => `<div class="between overview-source"><button class="btn soft" data-action="person-open" data-id="${a.id}">${esc(a.name)} ${a.archived ? "(بایگانی)" : ""}</button>${values(a.balances)}</div>`).join("") || '<p class="muted small">دفتر شخصی ندارد.</p>'}<h3>گروه‌ها</h3>${p.groups.map((g) => `<div class="between overview-source"><button class="btn soft" data-action="group" data-id="${g.id}">${esc(g.name)}</button>${values(g.balances)}</div>`).join("") || '<p class="muted small">گروه مشترکی ندارد.</p>'}<p class="help">برای ثبت پرداخت، دفتر مربوط را باز کنید. ثبت تسویه در دفتر شخصی، هزینه‌های گروه را تغییر نمی‌دهد.</p>`;
  }
  function banner(p) {
    return p
      ? `<section class="card total-person"><div class="between"><h2>ماندهٔ کلی با ${esc(p.name)}</h2><button class="btn soft" data-action="overall-person" data-id="${esc(p.id)}">تفکیک حساب‌ها</button></div>${values(p.balances)}<button class="btn primary" data-action="settle-all" data-person="${esc(p.id)}">تسویهٔ کلی با این فرد</button><p class="help">شخصی + همهٔ گروه‌ها؛ ماندهٔ دفتر زیر فقط حساب شخصی است.</p></section>`
      : "";
  }
  function click(el) {
    if (el.dataset.action !== "overall-person") return false;
    const p = S.overview?.find((p) => p.id === el.dataset.id);
    if (p)
      showModal(
        "کل حساب با " + p.name,
        details(p) + (S.demo ? "" : itemSection(p.id)),
      );
    return true;
  }
  return { click, banner };
}
