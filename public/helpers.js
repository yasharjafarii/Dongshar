import { currencies, minor, latin } from "./ledger.js";
import { itemized } from "./import.js";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function openBillHelper(members, currency, onApply) {
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const memberLabels = () =>
    members
      .map(
        (m) =>
          `<label class="flex small"><input type="checkbox" data-person="${m.id}" checked>${esc(m.name)}</label>`,
      )
      .join("");
  dialog.innerHTML = `<div class="modal-head"><h2>تقسیم ریزِ اقلام</h2><button type="button" class="iconbtn" data-close aria-label="بستن ابزار">×</button></div><form class="modal-body"><p class="help">برای هر قلم، مصرف‌کننده‌ها را مشخص کنید. هزینهٔ اضافه متناسب با جمع سهم‌ها تقسیم می‌شود.</p><div id="items"></div><button type="button" class="btn soft" id="add-item">+ قلم جدید</button><div class="field" style="margin-top:20px"><label>مالیات، انعام یا هزینهٔ اضافه (${esc(currencies[currency].label)})<input name="extra" inputmode="decimal" value="0"></label></div><div class="error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">اعمال مبلغ و سهم‌ها</button></div></form>`;
  const add = () => {
    const div = document.createElement("div");
    div.className = "split-list";
    div.innerHTML = `<div class="fields"><label>نام قلم<input data-title required maxlength="80" placeholder="مثلاً پیتزا"></label><label>مبلغ کل این قلم<input data-amount inputmode="decimal" required></label></div><div class="flex" style="flex-wrap:wrap;margin-top:10px">${memberLabels()}<button type="button" class="btn danger small" data-remove>حذف قلم</button></div>`;
    dialog.querySelector("#items").append(div);
  };
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#add-item").onclick = add;
  dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-remove]"))
      e.target.closest(".split-list").remove();
  });
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const items = [...dialog.querySelectorAll("#items>.split-list")].map(
          (row) => ({
            title: row.querySelector("[data-title]").value,
            amount: minor(row.querySelector("[data-amount]").value, currency),
            members: [...row.querySelectorAll("[data-person]:checked")].map(
              (x) => x.dataset.person,
            ),
          }),
        ),
        extra = minor(dialog.querySelector("[name=extra]").value, currency),
        result = itemized(items, extra);
      const note =
        items
          .map(
            (i) =>
              `${i.title}: ${i.amount / 10 ** currencies[currency].digits} ${currencies[currency].label} — ${i.members.map((id) => members.find((m) => m.id === id).name).join("، ")}`,
          )
          .join("\n") +
        `\nهزینهٔ اضافه: ${extra / 10 ** currencies[currency].digits} ${currencies[currency].label}`;
      onApply({ ...result, note });
      dialog.close();
    } catch (error) {
      dialog.querySelector(".error").textContent = error.message;
    }
  };
  add();
  dialog.showModal();
}
export function openConversion(currency, onApply) {
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  dialog.innerHTML = `<div class="modal-head"><h2>تبدیل با نرخ دلخواه</h2><button class="iconbtn" data-close aria-label="بستن ابزار">×</button></div><form class="modal-body"><div class="notice">نرخ را خودتان وارد می‌کنید؛ دنگشار نرخ بازار را دریافت نمی‌کند. نتیجه در واحد انتخاب‌شدهٔ هزینه ثبت می‌شود.</div><div class="field"><label>واحد مبلغ اصلی<select name="source">${Object.entries(
    currencies,
  )
    .map(
      ([c, v]) =>
        `<option value="${c}" ${c === "USD" ? "selected" : ""}>${esc(v.label)}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="field"><label>مبلغ اصلی<input name="amount" required inputmode="decimal"></label></div><div class="field"><label>هر واحد پول اصلی، چند ${esc(currencies[currency].label)} است؟<input name="rate" required inputmode="decimal"></label></div><div class="error" role="alert"></div><div class="form-actions"><button type="submit" class="btn primary">محاسبه و اعمال مبلغ</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const f = new FormData(e.target),
        source = f.get("source"),
        base = minor(f.get("amount"), source),
        rate = Number(latin(f.get("rate")));
      if (!Number.isFinite(rate) || rate <= 0)
        throw Error("نرخ باید مثبت باشد");
      const converted = Math.round(
        (base / 10 ** currencies[source].digits) *
          rate *
          10 ** currencies[currency].digits,
      );
      if (
        !Number.isSafeInteger(converted) ||
        converted <= 0 ||
        converted > 1e12
      )
        throw Error("نتیجهٔ تبدیل خارج از بازهٔ مجاز است");
      onApply({
        amount: converted,
        note: `تبدیل دستی: ${base / 10 ** currencies[source].digits} ${currencies[source].label} با نرخ ${rate} ${currencies[currency].label}`,
      });
      dialog.close();
    } catch (error) {
      dialog.querySelector(".error").textContent = error.message;
    }
  };
  dialog.showModal();
}
