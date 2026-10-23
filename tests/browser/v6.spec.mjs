import { test, expect } from "@playwright/test";
test("Full settlement preview, confirmed zero balances and reversal in profile", async ({
  page,
}) => {
  async function post(path, data) {
    const r = await page.request.post("/api" + path, {
      headers: { Origin: "http://127.0.0.1:8787" },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  await post("/auth/register", {
    email: `v6${Date.now()}@test.com`,
    name: "یاشار",
    password: "correct-password-123",
  });
  const p = await post("/people", {
    requestId: crypto.randomUUID(),
    name: "سارا",
    currency: "IRT",
  });
  await post("/people/" + p.id + "/entries", {
    requestId: crypto.randomUUID(),
    kind: "expense",
    title: "بستنی",
    amount: 200000,
    currency: "IRT",
    paid_by: "friend",
    my_share: 100000,
    date: "2026-10-22",
  });
  await page.goto("/");
  await page.locator(".person-card").filter({ hasText: "سارا" }).click();
  await page.getByRole("button", { name: "تسویهٔ کلی با این فرد" }).click();
  await expect(page.locator("#modal")).toContainText("۱۰۰٬۰۰۰");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/v6-bulk-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "تأیید پرداخت / تهاتر و تسویهٔ همه" })
    .click();
  await expect(page.locator(".personal-balance-grid")).toContainText(
    "حساب تسویه است",
  );
  await expect(page.locator(".item-settlement-row")).toContainText(
    "تسویهٔ کلی",
  );
  await page.getByRole("button", { name: "تسویهٔ کلی با این فرد" }).click();
  await page.getByRole("button", { name: "لغو تسویهٔ کلی قبلی" }).click();
  await page.getByRole("button", { name: "لغو این تسویهٔ کلی" }).click();
  await expect(page.locator(".personal-balance-grid")).toContainText("۱۰۰٬۰۰۰");
  await page.locator("[data-action=view][data-value=settings]").click();
  await page
    .getByRole("button", { name: "تغییر رمز عبور", exact: true })
    .click();
  await page.getByLabel("رمز فعلی").fill("correct-password-123");
  await page.getByLabel("رمز جدید", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "تغییر رمز", exact: true }).click();
  await page.getByRole("button", { name: "کلید را ذخیره کردم" }).click();
  await expect(page.locator("#auth-form")).toBeVisible();
  await page
    .getByRole("button", { name: "رمز را فراموش کرده‌ام؛ ارسال ایمیل" })
    .click();
  await page.getByLabel("ایمیل حساب").fill("someone@example.com");
  await page.getByRole("button", { name: "ارسال لینک بازیابی" }).click();
  await expect(page.locator("#modal .error")).toContainText("راه‌اندازی نشده");
});
