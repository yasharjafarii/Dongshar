import {
  jalaliParts,
  fromJalali,
  jalaliDays,
  toJalali,
  faDigits,
  months,
} from "./jalali.js";
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-calendar]");
  if (!button) return;
  const input = document.getElementById(button.dataset.calendar);
  let initial;
  try {
    initial = fromJalali(input.value);
  } catch {
    initial = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tehran",
    });
  }
  let { year, month } = jalaliParts(initial);
  const dialog = document.createElement("dialog");
  dialog.className = "calendar-dialog";
  dialog.setAttribute("aria-label", "تقویم شمسی");
  document.body.append(dialog);
  function render() {
    const first = fromJalali(`${year}/${month}/1`),
      offset = (new Date(first + "T12:00:00Z").getUTCDay() + 1) % 7;
    dialog.innerHTML = `<div class="modal-head"><h2>انتخاب تاریخ شمسی</h2><button type="button" class="iconbtn" data-close aria-label="بستن تقویم">×</button></div><div class="modal-body"><div class="calendar-toolbar"><button type="button" class="iconbtn" data-step="-1" aria-label="ماه قبل">→</button><select aria-label="ماه شمسی" data-month>${months.map((n, i) => `<option value="${i + 1}" ${month === i + 1 ? "selected" : ""}>${n}</option>`).join("")}</select><input aria-label="سال شمسی" data-year inputmode="numeric" value="${faDigits(year)}" maxlength="4"><button type="button" class="iconbtn" data-step="1" aria-label="ماه بعد">←</button></div><div class="calendar-grid">${["ش", "ی", "د", "س", "چ", "پ", "ج"].map((n) => `<span class="muted small">${n}</span>`).join("")}${"<span></span>".repeat(offset)}${Array.from(
      { length: jalaliDays(year, month) },
      (_, i) => {
        const d = i + 1,
          iso = fromJalali(`${year}/${month}/${d}`);
        return `<button type="button" class="calendar-day ${initial === iso ? "selected" : ""}" data-day="${d}" aria-label="${faDigits(d)} ${months[month - 1]} ${faDigits(year)}">${faDigits(d)}</button>`;
      },
    ).join(
      "",
    )}</div><button type="button" class="btn soft" data-today>امروز</button><p class="error" role="alert"></p></div>`;
  }
  dialog.addEventListener("click", (event) => {
    const el = event.target.closest("button");
    if (!el) return;
    if (el.hasAttribute("data-close")) dialog.close();
    if (el.dataset.step) {
      month += Number(el.dataset.step);
      if (month === 0) {
        month = 12;
        year--;
      }
      if (month === 13) {
        month = 1;
        year++;
      }
      year = Math.max(1200, Math.min(1600, year));
      render();
    }
    if (el.dataset.day || el.hasAttribute("data-today")) {
      const iso = el.dataset.day
        ? fromJalali(`${year}/${month}/${el.dataset.day}`)
        : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
      input.value = toJalali(iso, true);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      dialog.close();
    }
  });
  dialog.addEventListener("change", (event) => {
    if (event.target.hasAttribute("data-month")) {
      month = Number(event.target.value);
      render();
    }
    if (event.target.hasAttribute("data-year")) {
      const n = Number(
        event.target.value
          .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
          .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)),
      );
      if (Number.isInteger(n) && n >= 1200 && n <= 1600) {
        year = n;
        render();
      } else
        dialog.querySelector(".error").textContent =
          "سال باید بین ۱۲۰۰ تا ۱۶۰۰ باشد";
    }
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    input.focus();
  });
  render();
  dialog.showModal();
});
