const digits = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
export const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});
export const months = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
export function jalaliParts(iso) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  if (!Number.isFinite(d.getTime())) throw Error("تاریخ نامعتبر است");
  const p = Object.fromEntries(
    formatter.formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}
export function toJalali(iso, persian = false) {
  const p = jalaliParts(iso),
    s = `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
  return persian ? faDigits(s) : s;
}
export function fromJalali(value) {
  const s = digits(value).trim().replace(/-/g, "/"),
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) throw Error("تاریخ شمسی را مانند ۱۴۰۵/۰۷/۰۹ وارد کنید");
  const [y, mo, d] = m.slice(1).map(Number);
  if (y < 1200 || y > 1600 || mo < 1 || mo > 12 || d < 1 || d > 31)
    throw Error("تاریخ شمسی معتبر نیست (سال ۱۲۰۰ تا ۱۶۰۰)");
  const key = y * 10000 + mo * 100 + d;
  let lo = Math.floor(Date.UTC(y + 620, 0, 1) / 86400000),
    hi = Math.floor(Date.UTC(y + 623, 0, 1) / 86400000);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2),
      iso = new Date(mid * 86400000 + 43200000).toISOString().slice(0, 10),
      p = jalaliParts(iso),
      k = p.year * 10000 + p.month * 100 + p.day;
    if (k === key) return iso;
    if (k < key) lo = mid + 1;
    else hi = mid - 1;
  }
  throw Error("این روز در تقویم شمسی وجود ندارد");
}
export function jalaliDays(y, m) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  try {
    fromJalali(`${y}/12/30`);
    return 30;
  } catch {
    return 29;
  }
}
export function nextJalaliMonth(iso) {
  const p = jalaliParts(iso),
    m = p.month === 12 ? 1 : p.month + 1,
    y = p.year + (p.month === 12 ? 1 : 0);
  return fromJalali(`${y}/${m}/${Math.min(p.day, jalaliDays(y, m))}`);
}
export function displayDay(value) {
  const normalized =
    value.length === 10
      ? value + "T12:00:00Z"
      : /Z$|[+]\d\d:\d\d$/.test(value)
        ? value
        : value.replace(" ", "T") + "Z";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tehran",
  }).format(new Date(normalized));
}
export function dateInput(id, iso, label = "تاریخ (شمسی)", name = "date") {
  return `<div class="field"><label for="${id}">${label}</label><div class="jalali-control"><input id="${id}" name="${name}" data-jalali inputmode="numeric" type="text" dir="ltr" required maxlength="10" placeholder="۱۴۰۵/۰۷/۰۹" value="${toJalali(iso, true)}"><button type="button" class="iconbtn" data-calendar="${id}" aria-label="انتخاب ${label}" title="تقویم شمسی"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2"/></svg></button></div></div>`;
}
