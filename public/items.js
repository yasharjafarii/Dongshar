export function createItemsUI({
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
}) {
  let chosen = null,
    selected = null;
  function totals(items) {
    const sums = new Map();
    for (const e of items)
      sums.set(e.currency, (sums.get(e.currency) || 0) + e.delta);
    return [...sums]
      .map(
        ([currency, delta]) =>
          `<span>${money(Math.abs(delta), currency)} · ${delta > 0 ? "دریافت از دوست" : delta < 0 ? "پرداخت به دوست" : "تهاتر کامل"}</span>`,
      )
      .join("<br>");
  }
  const rows = new Map();
  function section(key) {
    const id = "items-" + crypto.randomUUID();
    queueMicrotask(async () => {
      const node = document.getElementById(id);
      if (!node) return;
      try {
        const d = await api("/items?person=" + encodeURIComponent(key));
        if (!node.isConnected) return;
        node.innerHTML =
          '<h3>تسویهٔ موردی</h3><p class="help">فقط پرداختی را ثبت کنید که انجام شده است. تسویه‌های کلی قبلی به این موارد تخصیص داده نشده‌اند؛ دوباره ثبتشان نکنید. مبلغ هر مورد مستقل از خالص کل حساب است.</p>' +
          `<div class="item-selection-toolbar"><label><input type="checkbox" data-select-all> انتخاب همهٔ موارد باز</label><span data-selection-summary aria-live="polite"></span><button class="btn primary" data-action="items-select-settle" disabled>تسویهٔ انتخاب‌شده‌ها</button></div>` +
          (d.items
            .map((e) => {
              rows.set(e.key, { ...e, person: key });
              return `<article class="item-settlement-row"><input type="checkbox" class="item-checkbox" data-item-key="${esc(e.key)}" aria-label="انتخاب ${esc(e.title)}" ${e.settled || e.archived ? "disabled" : ""}><div><strong>${esc(e.title)}</strong><p class="small muted">${esc(e.source)} · ${day(e.date)}</p><span>${money(Math.abs(e.delta), e.currency)} · ${e.delta > 0 ? "دریافت از دوست" : "پرداخت به دوست"}</span></div>${e.settled ? `<div><span class="pill">${e.bulk ? "تسویهٔ کلی" : "تسویه‌شده"} ✓</span>${e.can_undo ? `<button class="btn soft" data-action="item-undo" data-key="${esc(e.key)}">لغو تسویه</button>` : ""}</div>` : `<button class="btn soft" data-action="item-settle" data-key="${esc(e.key)}" ${e.archived ? "disabled" : ""}>تسویهٔ این مورد</button>`}</article>`;
            })
            .join("") || '<p class="muted">موردی وجود ندارد.</p>');
        const boxes = [
          ...node.querySelectorAll("[data-item-key]:not(:disabled)"),
        ];
        const all = node.querySelector("[data-select-all]");
        all.disabled = !boxes.length;
        const update = () => {
          const picked = boxes
            .filter((x) => x.checked)
            .map((x) => rows.get(x.dataset.itemKey));
          all.checked = !!boxes.length && picked.length === boxes.length;
          all.indeterminate = picked.length > 0 && picked.length < boxes.length;
          node.querySelector("[data-selection-summary]").innerHTML =
            picked.length
              ? picked.length.toLocaleString("fa-IR") +
                " مورد انتخاب شده<br>" +
                totals(picked)
              : "موردی انتخاب نشده";
          node.querySelector('[data-action="items-select-settle"]').disabled =
            !picked.length;
        };
        node.addEventListener("change", (e) => {
          if (e.target === all) boxes.forEach((x) => (x.checked = all.checked));
          update();
        });
        update();
      } catch (e) {
        node.textContent = e.message;
      }
    });
    return `<section id="${id}" class="card item-settlement-list" aria-live="polite">در حال دریافت موارد…</section>`;
  }
  async function click(el) {
    if (el.dataset.action === "items-select-settle") {
      if (S.demo) return true;
      const items = [
        ...el
          .closest(".item-settlement-list")
          .querySelectorAll("[data-item-key]:checked:not(:disabled)"),
      ].map((x) => rows.get(x.dataset.itemKey));
      if (!items.length) return true;
      selected = { items, requestId: crypto.randomUUID() };
      showModal(
        "تسویهٔ موارد انتخاب‌شده",
        '<ul class="selected-items-preview">' +
          items
            .map(
              (e) =>
                "<li>" +
                esc(e.title) +
                " · " +
                esc(e.source) +
                " · " +
                money(Math.abs(e.delta), e.currency) +
                " · " +
                (e.delta > 0 ? "دریافت" : "پرداخت") +
                "</li>",
            )
            .join("") +
          "</ul><p>" +
          totals(items) +
          '</p><p class="notice">فقط موارد انتخاب‌شده تسویه می‌شوند. مبلغ بالا خالص پرداخت و دریافت در هر ارز است؛ بدهی و طلب مقابل با هم تهاتر می‌شوند. این دکمه پول جابه‌جا نمی‌کند. پرداخت‌های کلی قبلی را دوباره ثبت نکنید.</p>' +
          dateInput("items-selected-date", today(), "تاریخ پرداخت (شمسی)") +
          '<div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn primary" data-action="items-selected-confirm">تأیید تسویهٔ انتخاب‌شده‌ها</button></div>',
      );
      return true;
    }
    if (el.dataset.action === "items-selected-confirm") {
      el.disabled = true;
      try {
        const date = fromJalali(
          document.getElementById("items-selected-date").value,
        );
        selected.date ??= date;
        await api("/items/settle-selected", "POST", {
          person: selected.items[0].person,
          items: selected.items.map(({ key, version }) => ({ key, version })),
          requestId: selected.requestId,
          date: selected.date,
        });
        modal.close();
        await refresh();
        toast("موارد انتخاب‌شده تسویه شدند");
      } catch (e) {
        el.disabled = false;
        throw e;
      }
      return true;
    }
    if (["item-settle", "item-undo"].includes(el.dataset.action)) {
      if (S.demo) return true;
      chosen = rows.get(el.dataset.key);
      if (!chosen) return true;
      chosen = { ...chosen, undo: el.dataset.action === "item-undo" };
      if (chosen.undo) {
        showModal(
          "لغو تسویهٔ " + chosen.title,
          `<p>پرداخت ثبت‌شده برای این مورد لغو و مانده بازگردانده شود؟</p><div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn danger" data-action="item-confirm">لغو تسویه</button></div>`,
        );
        return true;
      }
      showModal(
        "تسویهٔ " + chosen.title,
        `<p>${chosen.delta > 0 ? "از دوست خود دریافت کرده‌اید" : "به دوست خود پرداخت کرده‌اید"}: ${money(Math.abs(chosen.delta), chosen.currency)}</p><p class="notice">این دکمه پول جابه‌جا نمی‌کند؛ یک پرداخت جدید فقط بابت همین مورد ثبت می‌کند. اگر قبلاً با پرداخت کلی تسویه کرده‌اید، دوباره ثبت نکنید.</p>${dateInput("item-settle-date", today(), "تاریخ پرداخت (شمسی)")}<div class="form-actions"><button class="btn secondary" data-action="close">انصراف</button><button class="btn primary" data-action="item-confirm">پرداخت انجام شده؛ تسویه کن</button></div>`,
      );
      return true;
    }
    if (el.dataset.action === "item-confirm") {
      el.disabled = true;
      try {
        await api(chosen.undo ? "/items/undo" : "/items/settle", "POST", {
          person: chosen.person,
          item: chosen.key,
          version: chosen.version,
          date: chosen.undo
            ? undefined
            : fromJalali(document.getElementById("item-settle-date").value),
        });
        modal.close();
        await refresh();
        toast(chosen.undo ? "تسویه لغو شد" : "این مورد تسویه شد");
      } catch (e) {
        el.disabled = false;
        throw e;
      }
      return true;
    }
    return false;
  }
  return { section, click };
}
