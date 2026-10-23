import { test, expect } from "@playwright/test";
test("Per-item settlement and undo, with cached navigation and no unrelated group reload", async ({
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await post("/auth/register", {
    email: `v5${Date.now()}@test.com`,
    name: "یاشار",
    password: "correct-password-123",
  });
  const friend = await post("/people", {
    requestId: crypto.randomUUID(),
    name: "سارا",
    currency: "IRT",
  });
  for (const title of ["بستنی", "شام"])
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
  await post("/groups", { name: "گروه نامرتبط", currency: "IRT" });
  const reads = [];
  page.on("request", (r) => {
    if (r.method() === "GET" && r.url().includes("/api/"))
      reads.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  const card = () => page.locator(".person-card").filter({ hasText: "سارا" });
  await expect(card()).toBeVisible();
  expect(reads.filter((p) => p.startsWith("/api/groups/"))).toHaveLength(0);
  reads.length = 0;
  await card().click();
  await expect(page.locator(".item-settlement-row")).toHaveCount(2);
  expect(
    reads.filter((p) =>
      ["/api/me", "/api/people", "/api/overview"].includes(p),
    ),
  ).toHaveLength(0);
  await page.locator("[data-action=view][data-value=people]").first().click();
  reads.length = 0;
  await card().click();
  await expect(page.locator(".item-settlement-row")).toHaveCount(2);
  expect(reads).toHaveLength(0);
  const ice = () =>
      page.locator(".item-settlement-row").filter({ hasText: "بستنی" }),
    dinner = () =>
      page.locator(".item-settlement-row").filter({ hasText: "شام" });
  await ice().getByRole("button", { name: "تسویهٔ این مورد" }).click();
  await page
    .getByRole("button", { name: "پرداخت انجام شده؛ تسویه کن" })
    .click();
  await expect(ice()).toContainText("تسویه‌شده");
  await expect(
    dinner().getByRole("button", { name: "تسویهٔ این مورد" }),
  ).toBeVisible();
  await expect(page.locator(".personal-balance-grid")).toContainText("۱۰۰٬۰۰۰");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".item-settlement-list").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/v5-items-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await ice().getByRole("button", { name: "لغو تسویه" }).click();
  await page
    .locator("#modal")
    .getByRole("button", { name: "لغو تسویه", exact: true })
    .click();
  await expect(
    ice().getByRole("button", { name: "تسویهٔ این مورد" }),
  ).toBeVisible();
  await expect(page.locator(".personal-balance-grid")).toContainText("۲۰۰٬۰۰۰");
  expect(errors).toEqual([]);
});
