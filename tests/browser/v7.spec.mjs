import { test, expect } from "@playwright/test";
test("Select several items, review totals, cancel, select all and settle only selected rows", async ({
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
  await post("/auth/register", {
    email: `v7${Date.now()}@test.com`,
    name: "یاشار",
    password: "correct-password-123",
  });
  const friend = await post("/people", {
    requestId: crypto.randomUUID(),
    name: "سارا",
    currency: "IRT",
  });
  for (const title of ["بستنی", "شام", "سفر"])
    await post("/people/" + friend.id + "/entries", {
      requestId: crypto.randomUUID(),
      title,
      kind: "expense",
      amount: 200000,
      currency: "IRT",
      paid_by: "friend",
      my_share: 100000,
      date: "2026-10-22",
    });
  await page.goto("/");
  await page.locator(".person-card").filter({ hasText: "سارا" }).click();
  const boxes = page.locator("[data-item-key]"),
    button = page.getByRole("button", {
      name: "تسویهٔ انتخاب‌شده‌ها",
      exact: true,
    });
  await expect(boxes).toHaveCount(3);
  await expect(button).toBeDisabled();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.locator("[data-selection-summary]")).toContainText(
    "۲۰۰٬۰۰۰",
  );
  await expect(page.locator("[data-select-all]")).toHaveJSProperty(
    "indeterminate",
    true,
  );
  await button.click();
  await expect(page.locator(".selected-items-preview li")).toHaveCount(2);
  await page.locator("#modal").getByRole("button", { name: "انصراف" }).click();
  await expect(boxes.nth(0)).toBeChecked();
  await page.locator("[data-select-all]").check();
  await expect(boxes.nth(2)).toBeChecked();
  await boxes.nth(2).uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".item-settlement-list").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/v7-selection-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await button.click();
  await page
    .getByRole("button", { name: "تأیید تسویهٔ انتخاب‌شده‌ها" })
    .click();
  await expect(page.locator("[data-item-key]:disabled")).toHaveCount(2);
  await expect(page.locator("[data-item-key]:not(:disabled)")).toHaveCount(1);
  await expect(page.locator(".personal-balance-grid")).toContainText("۱۰۰٬۰۰۰");
  expect(errors).toEqual([]);
});
