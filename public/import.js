import { fromJalali } from "./jalali.js";
import { minor, currencies, split } from "./ledger.js";
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) quoted = false;
      else if (!field) quoted = true;
      else throw Error("علامت نقل‌قول در CSV نامعتبر است");
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("نقل‌قول CSV بسته نشده است");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function importRows(text, members) {
  const [headers, ...rows] = parseCSV(text);
  if (!headers) throw Error("فایل خالی است");
  const expected = [
    "date",
    "title",
    "amount",
    "currency",
    "payer",
    "participants",
    "category",
  ];
  if (expected.some((x) => !headers.includes(x)))
    throw Error("ستون‌های فایل باید با فایل نمونه مطابقت داشته باشند");
  if (!rows.length || rows.length > 20)
    throw Error("هر بار بین ۱ تا ۲۰ هزینه وارد کنید");
  const resolve = (name) => {
    const found = members.filter((m) => m.id === name || m.name === name);
    if (found.length !== 1)
      throw Error(
        `عضو «${name}» پیدا نشد یا نام تکراری دارد؛ از شناسه استفاده کنید`,
      );
    return found[0].id;
  };
  return rows.map((cells, i) => {
    if (cells.length !== headers.length)
      throw Error(`تعداد ستون‌های سطر ${i + 2} درست نیست`);
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()]));
    if (!currencies[r.currency])
      throw Error(`واحد پول سطر ${i + 2} نامعتبر است`);
    const amount = minor(r.amount, r.currency),
      entries = r.participants
        .split("|")
        .filter(Boolean)
        .map((n) => ({ id: resolve(n.trim()), value: 1 }));
    split(amount, "equal", entries);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      Number(r.date.slice(0, 4)) < 1700
    )
      r.date = fromJalali(r.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      !Number.isFinite(Date.parse(r.date)) ||
      new Date(r.date).toISOString().slice(0, 10) !== r.date
    )
      throw Error(`تاریخ سطر ${i + 2} معتبر نیست`);
    if (!r.title) throw Error(`عنوان سطر ${i + 2} خالی است`);
    return {
      date: r.date,
      title: r.title,
      amount,
      currency: r.currency,
      payers: [{ id: resolve(r.payer), value: amount }],
      mode: "equal",
      entries,
      category: r.category || "other",
      note: "واردشده از CSV",
    };
  });
}
export function itemized(items, extras = 0) {
  const totals = new Map();
  let subtotal = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0)
      throw Error("مبلغ هر قلم باید مثبت باشد");
    const allocations = split(
      item.amount,
      "equal",
      item.members.map((id) => ({ id, value: 1 })),
    );
    subtotal += item.amount;
    for (const p of allocations)
      totals.set(p.id, (totals.get(p.id) || 0) + p.value);
  }
  if (!subtotal) throw Error("حداقل یک قلم وارد کنید");
  if (!Number.isSafeInteger(extras) || extras < 0)
    throw Error("هزینهٔ اضافه نامعتبر است");
  const extraSplit = extras
    ? split(
        extras,
        "shares",
        [...totals].map(([id, value]) => ({ id, value })),
      )
    : [];
  for (const p of extraSplit) totals.set(p.id, totals.get(p.id) + p.value);
  const amount = subtotal + extras;
  if (amount > 1e12) throw Error("مبلغ بیش از حد مجاز است");
  return { amount, entries: [...totals].map(([id, value]) => ({ id, value })) };
}
