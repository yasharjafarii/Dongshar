import { nextJalaliMonth } from "./jalali.js";
export const currencies = Object.assign(Object.create(null), {
  IRT: { label: "تومان", digits: 0 },
  IRR: { label: "ریال", digits: 0 },
  USD: { label: "دلار", digits: 2 },
  EUR: { label: "یورو", digits: 2 },
  GBP: { label: "پوند", digits: 2 },
  AED: { label: "درهم", digits: 2 },
  TRY: { label: "لیر", digits: 2 },
});
const names = new Intl.DisplayNames(["fa"], { type: "currency" });
for (const code of Intl.supportedValuesOf("currency")) {
  if (!currencies[code])
    currencies[code] = {
      label: names.of(code) + " (" + code + ")",
      digits: new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits,
    };
}
export function latin(value) {
  return String(value)
    .replace(/[۰-۹]/g, (x) => "۰۱۲۳۴۵۶۷۸۹".indexOf(x))
    .replace(/[٠-٩]/g, (x) => "٠١٢٣٤٥٦٧٨٩".indexOf(x))
    .replace(/[٬,\s]/g, "")
    .replace("٫", ".");
}
export function minor(value, currency = "IRT") {
  const digits = currencies[currency]?.digits;
  if (digits === undefined) throw Error("واحد پول نامعتبر است");
  const s = latin(value);
  if (!/^\d+(\.\d+)?$/.test(s)) throw Error("مبلغ معتبر وارد کنید");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > digits) throw Error("تعداد رقم اعشار مجاز نیست");
  const n = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0"));
  if (!Number.isSafeInteger(n) || n > 1e12)
    throw Error("مبلغ بیش از حد مجاز است");
  return n;
}
export function split(amount, mode, entries) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e12)
    throw Error("مبلغ باید مثبت باشد");
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 100 ||
    new Set(entries.map((x) => x.id)).size !== entries.length
  )
    throw Error("افراد تقسیم را مشخص کنید");
  if (
    entries.some(
      (x) =>
        !x.id || !Number.isFinite(x.value) || x.value < 0 || x.value > 1e12,
    )
  )
    throw Error("سهم نامعتبر است");
  if (mode === "exact") {
    if (
      entries.some((x) => !Number.isSafeInteger(x.value)) ||
      entries.reduce((s, x) => s + x.value, 0) !== amount
    )
      throw Error("جمع سهم‌ها باید برابر مبلغ باشد");
    return entries.map((x) => ({ ...x }));
  }
  if (!["equal", "percent", "shares"].includes(mode))
    throw Error("روش تقسیم نامعتبر است");
  const weights = entries.map((x) => (mode === "equal" ? 1 : x.value)),
    total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || (mode === "percent" && Math.abs(total - 100) > 0.000001))
    throw Error("جمع درصدها باید ۱۰۰ و جمع سهم‌ها مثبت باشد");
  const exact = weights.map((x) => (amount * x) / total),
    values = exact.map(Math.floor);
  let rest = amount - values.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - values[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let i = 0; i < rest; i++) values[order[i % order.length].i]++;
  return entries.map((x, i) => ({ id: x.id, value: values[i] }));
}
export function balances(expenses, settlements = []) {
  const result = {};
  const add = (c, id, n) => {
    result[c] ??= {};
    result[c][id] = (result[c][id] || 0) + n;
  };
  for (const e of expenses.filter((x) => !x.deleted)) {
    for (const p of e.payers) add(e.currency, p.id, p.value);
    for (const p of e.allocations) add(e.currency, p.id, -p.value);
  }
  for (const p of settlements.filter((x) => !x.deleted)) {
    add(p.currency, p.sender, p.amount);
    add(p.currency, p.receiver, -p.amount);
  }
  return result;
}
export function simplify(balance) {
  const debt = Object.entries(balance)
    .filter(([, n]) => n < 0)
    .map(([id, n]) => ({ id, n: -n }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const credit = Object.entries(balance)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const out = [];
  let i = 0,
    j = 0;
  while (i < debt.length && j < credit.length) {
    const amount = Math.min(debt[i].n, credit[j].n);
    out.push({ sender: debt[i].id, receiver: credit[j].id, amount });
    debt[i].n -= amount;
    credit[j].n -= amount;
    if (!debt[i].n) i++;
    if (!credit[j].n) j++;
  }
  return out;
}
export function nextDate(date, cadence, calendar = "gregory") {
  if (cadence === "monthly" && calendar === "persian")
    return nextJalaliMonth(date);
  const d = new Date(date + "T12:00:00Z");
  if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (cadence === "monthly") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else throw Error("دوره نامعتبر");
  return d.toISOString().slice(0, 10);
}
