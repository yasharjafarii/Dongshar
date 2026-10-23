import { test, expect } from "@playwright/test";
test("Dongshar shows combined balances everywhere and removes/restores mistaken members", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function post(path, data) {
    const r = await page.request.post("/api" + path, {
      headers: { Origin: "http://127.0.0.1:8787" },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  const reg = await post("/auth/register", {
    email: `v4${Date.now()}@test.com`,
    name: "یاشار",
    password: "correct-password-123",
  });
  const friend = await post("/people", {
    requestId: crypto.randomUUID(),
    name: "سارا",
    currency: "IRT",
  });
  const mistaken = await post("/people", {
    requestId: crypto.randomUUID(),
    name: "عضو اشتباهی",
    currency: "IRT",
  });
  const g = await post("/groups", {
    name: "گروه آزمایش نسخه چهار",
    currency: "IRT",
  });
  const member = await post("/groups/" + g.id + "/members", {
    account_id: friend.id,
  });
  await post("/groups/" + g.id + "/members", { account_id: mistaken.id });
  await post("/groups/" + g.id + "/expenses", {
    title: "شام",
    amount: 200000,
    currency: "IRT",
    date: "2026-10-02",
    category: "food",
    mode: "equal",
    entries: [
      { id: reg.user.id, value: 1 },
      { id: member.id, value: 1 },
    ],
    payers: [{ id: reg.user.id, value: 200000 }],
  });
  await post("/people/" + friend.id + "/entries", {
    requestId: crypto.randomUUID(),
    kind: "payment",
    title: "دریافت",
    amount: 30000,
    currency: "IRT",
    date: "2026-10-02",
    paid_by: "friend",
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/دنگشار/);
  await expect(page.locator("footer")).toContainText("یاشار جعفری");
  const card = page.locator(".person-card").filter({ hasText: "سارا" });
  await expect(card).toContainText("۷۰٬۰۰۰");
  await card.click();
  await expect(page.locator(".total-person")).toContainText("۷۰٬۰۰۰");
  await expect(page.locator(".personal-balance-grid")).toContainText("۳۰٬۰۰۰");
  await page.getByRole("button", { name: "تفکیک حساب‌ها" }).click();
  await expect(page.locator("#modal")).toContainText("۱۰۰٬۰۰۰");
  await page.locator("#modal [data-action=group]").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(
    page.locator(".overall-inline").filter({ hasText: "۷۰٬۰۰۰" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "حذف عضو اشتباهی از گروه" }).click();
  await page.getByRole("button", { name: "حذف عضو", exact: true }).click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(
    page.locator(".member-line").filter({ hasText: "عضو اشتباهی" }),
  ).toContainText("حذف‌شده");
  await page.getByRole("button", { name: "هزینهٔ جدید", exact: true }).click();
  await expect(page.locator("#split-list")).not.toContainText("عضو اشتباهی");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "افزودن از دوستان من" }).click();
  await page
    .locator("[data-action=statement-add-member]")
    .filter({ hasText: "عضو اشتباهی" })
    .click();
  await expect(
    page.getByRole("button", { name: "حذف عضو اشتباهی از گروه" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "حذف سارا از گروه" }).click();
  await page.getByRole("button", { name: "حذف عضو", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("ماندهٔ باز");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "تم تاریک", exact: true }).click();
  await page.screenshot({
    path: "test-results/v4-group.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("[data-action=view][data-value=people]").first().click();
  await expect(
    page.locator(".person-card").filter({ hasText: "سارا" }),
  ).toContainText("۷۰٬۰۰۰");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/v4-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
