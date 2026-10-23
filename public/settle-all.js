export function createSettleAllUI({
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
}) {
  let preview = null,
    person = null,
    requestId = null;
  const sums = (bs) =>
    Object.entries(bs)
      .map(
        ([c, n]) =>
          `<p>${money(Math.abs(n), c)} · ${n > 0 ? "دریافت از دوست" : n < 0 ? "پرداخت به دوست" : "تهاتر؛ بدون پرداخت خالص"}</p>`,
      )
      .join("") || "<p>ماندهٔ نقدی صفر است.</p>";
  async function click(el) {
    const a = el.dataset.action;
    if (!a.startsWith("settle-all")) return false;
    if (S.demo) {
      toast("برای ثبت تسویه حساب بسازید");
      return true;
    }
    if (a === "settle-all") {
      person = el.dataset.person;
      preview = await api("/settle-all?person=" + encodeURIComponent(person));
      requestId = crypto.randomUUID();
      showModal(
        "تسویهٔ کلی با " + preview.name,
        `<h3>پرداخت خالص به تفکیک ارز</h3>${sums(preview.totals)}<p class="notice">فقط پس از پرداخت یا توافق بر تهاتر تأیید کنید. ماندهٔ هر دفتر جدا صفر می‌شود؛ گروه‌ها و دفترهای بایگانی‌شده هم در محاسبه‌اند. مبلغ گروه‌ها برای بستن کامل پیشنهاد تسویه دوباره محاسبه شده است.</p>${preview.rows.map((r) => `<div class="overview-source"><strong>${esc(r.name)}</strong>${sums({ [r.currency]: r.delta })}</div>`).join("")}${dateInput("all-date", today(), "تاریخ تسویه (شمسی)")}<div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn primary" data-action="settle-all-confirm">تأیید پرداخت / تهاتر و تسویهٔ همه</button></div>${preview.batches.map((b) => `<button class="btn soft" data-action="settle-all-undo" data-id="${b.id}">لغو تسویهٔ کلی قبلی</button>`).join("")}`,
      );
    }
    if (a === "settle-all-confirm") {
      el.disabled = true;
      try {
        await api("/settle-all", "POST", {
          person,
          requestId,
          fingerprint: preview.fingerprint,
          date: fromJalali(document.getElementById("all-date").value),
        });
        modal.close();
        await refresh();
        toast("تسویهٔ کلی ثبت شد");
      } catch (e) {
        el.disabled = false;
        throw e;
      }
    }
    if (a === "settle-all-undo")
      showModal(
        "لغو تسویهٔ کلی",
        '<p>تمام پرداخت‌ها و تهاترهای این تسویه لغو و مانده‌ها بازگردانده شوند؟</p><button class="btn danger" data-action="settle-all-undo-confirm" data-id="' +
          el.dataset.id +
          '">لغو این تسویهٔ کلی</button>',
      );
    if (a === "settle-all-undo-confirm") {
      await api("/settle-all/undo", "POST", { id: el.dataset.id });
      modal.close();
      await refresh();
      toast("تسویهٔ کلی لغو شد");
    }
    return true;
  }
  return { click };
}
