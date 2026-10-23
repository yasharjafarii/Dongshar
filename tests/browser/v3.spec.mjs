import { test, expect } from "@playwright/test";
test("Jalali calendar, offline group friend and anonymous read-only statement", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "ساخت حساب", exact: true }).click();
  await page.getByLabel("نام شما").fill("یاشار");
  await page
    .getByLabel("ایمیل", { exact: true })
    .fill(`v3${Date.now()}@test.com`);
  await page.getByLabel("رمز عبور", { exact: true }).fill("v3-password-123");
  await page.locator("#auth-form button[type=submit]").click();
  await page.getByRole("button", { name: "کلید را ذخیره کردم" }).click();
  await page.getByRole("button", { name: "افزودن اولین دوست" }).click();
  await page.getByLabel("نام دوست", { exact: true }).fill("سارا");
  await page.getByLabel("یادداشت خصوصی (اختیاری)").fill("راز خصوصی من");
  await page.locator("#personal-new-form button[type=submit]").click();
  await page.getByRole("button", { name: "ثبت طلب من" }).click();
  await page.getByLabel("مبلغ کل", { exact: true }).fill("50000");
  await page.getByLabel("تاریخ (شمسی)", { exact: true }).fill("۱۴۰۵/۰۷/۱۰");
  await page.locator("#personal-entry-form button[type=submit]").click();
  await page.getByRole("button", { name: "گروه جدید", exact: true }).click();
  await page.getByLabel("اسم گروه").fill("سفر بدون دعوت");
  await page.locator("#group-form button[type=submit]").click();
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "افزودن از دوستان من" }).click();
  await page
    .locator("[data-action=statement-add-member]")
    .filter({ hasText: "سارا" })
    .click();
  await expect(
    page.locator(".member-line").filter({ hasText: "سارا" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "هزینهٔ جدید", exact: true }).click();
  await page.getByLabel("بابت چی هزینه کردید؟").fill("شام سفر");
  await page.getByLabel("مبلغ کل", { exact: true }).fill("200000");
  await page.getByLabel("تاریخ (شمسی)", { exact: true }).fill("۱۴۰۳/۰۱/۰۱");
  await page.locator("[data-calendar=date]").click();
  await expect(page.getByRole("dialog", { name: "تقویم شمسی" })).toBeVisible();
  await page.screenshot({
    path: "test-results/v3-calendar.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "۲ فروردین ۱۴۰۳", exact: true })
    .click();
  await expect(page.getByLabel("تاریخ (شمسی)", { exact: true })).toHaveValue(
    "۱۴۰۳/۰۱/۰۲",
  );
  await page
    .getByRole("button", { name: "تم تاریک", exact: true })
    .evaluate((b) => b.click());
  await page.screenshot({
    path: "test-results/v3-calendar-form.png",
    fullPage: true,
  });
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  const state = await page.evaluate(async () => {
    const me = await (await fetch("/api/me")).json();
    return await (await fetch("/api/groups/" + me.groups[0].id)).json();
  });
  expect(state.expenses[0].date).toBe("2024-03-21");
  expect(state.members).toHaveLength(2);
  await page.getByRole("button", { name: "لینک مشاهدهٔ حساب عضو" }).click();
  await page
    .locator("[data-action=statement-group-member]")
    .filter({ hasText: "سارا" })
    .click();
  await page.getByRole("button", { name: "ساخت لینک فقط‌خواندنی" }).click();
  const link = await page
    .getByLabel("لینک مشاهدهٔ صورتحساب", { exact: true })
    .inputValue();
  const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await ctx.newPage();
  await guest.goto(link);
  await expect(
    guest.getByRole("heading", { name: "سارا، حساب شما با یاشار" }),
  ).toBeVisible();
  await expect(guest.locator("body")).toContainText("شام سفر");
  await expect(guest.locator("body")).not.toContainText("راز خصوصی من");
  expect((await ctx.cookies()).length).toBe(0);
  await guest.getByRole("button", { name: "تم روشن", exact: true }).click();
  await guest.screenshot({
    path: "test-results/v3-statement-mobile.png",
    fullPage: true,
  });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await guest.setViewportSize({ width: 1280, height: 900 });
  await guest.getByRole("button", { name: "تم تاریک", exact: true }).click();
  await guest.screenshot({
    path: "test-results/v3-statement-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "باطل کردن لینک", exact: true })
    .click();
  await guest.reload();
  await expect(
    guest.getByRole("heading", { name: "صورتحساب در دسترس نیست" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});
