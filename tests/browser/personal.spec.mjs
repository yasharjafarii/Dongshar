import { test, expect } from "@playwright/test";
async function signup(page, email, name) {
  await page.getByRole("button", { name: "ساخت حساب", exact: true }).click();
  await page.getByLabel("نام شما").fill(name);
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("personal-password-123");
  await page.locator("#auth-form button[type=submit]").click();
  await page.getByRole("button", { name: "کلید را ذخیره کردم" }).click();
}
async function saveEntry(page) {
  await page.locator("#personal-entry-form button[type=submit]").click();
  await expect(page.locator("#modal")).not.toBeVisible();
}
test("Manual friend works without a group or invitation, then can optionally share the same account", async ({
  page,
  browser,
}) => {
  const errors = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(new URL(r.url()).pathname);
  });
  const seed = Date.now();
  await page.goto("/");
  await signup(page, `personal${seed}@example.com`, "یاشار");
  await page.getByRole("button", { name: "افزودن اولین دوست" }).click();
  await page.getByLabel("نام دوست", { exact: true }).fill("سارا");
  await page.getByLabel("یادداشت خصوصی (اختیاری)").fill("یادداشت فقط برای من");
  await page.locator("#personal-new-form button[type=submit]").click();
  await expect(
    page.getByRole("heading", { name: "حساب با سارا" }),
  ).toBeVisible();
  await expect(page.locator("#content")).toContainText("فقط برای شماست");
  expect(posts).not.toContain("/api/join");
  expect(posts).not.toContain("/api/groups");
  expect(posts.some((p) => p.includes("invite"))).toBe(false);
  const accounts = await page.evaluate(
    async () => await (await fetch("/api/people")).json(),
  );
  expect(accounts.people).toHaveLength(1);
  const id = accounts.people[0].id;
  await page.getByRole("button", { name: "ثبت طلب من" }).click();
  await page.getByLabel("مبلغ کل", { exact: true }).fill("۱۲۰۰۰۰");
  await saveEntry(page);
  await expect(page.locator(".personal-balance-grid")).toContainText(
    "سارا به شما بدهکار است",
  );
  await page.getByRole("button", { name: "هزینهٔ مشترک", exact: true }).click();
  await page.getByLabel("عنوان تراکنش").fill("شام مشترک");
  await page.getByLabel("مبلغ کل", { exact: true }).fill("100001");
  await saveEntry(page);
  await page.getByRole("button", { name: "ثبت بدهی من" }).click();
  await page.getByLabel("مبلغ کل", { exact: true }).fill("30000");
  await saveEntry(page);
  await page.getByRole("button", { name: "ثبت تسویه", exact: true }).click();
  await expect(page.getByLabel("مبلغ کل", { exact: true })).toHaveValue(
    "140000",
  );
  await page.getByLabel("مبلغ کل", { exact: true }).fill("40000");
  await saveEntry(page);
  expect(
    (
      await page.evaluate(
        async (id) => await (await fetch("/api/people/" + id)).json(),
        id,
      )
    ).balances.IRT,
  ).toBe(100000);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی CSV" }).click();
  expect((await download).suggestedFilename()).toBe("dong-personal.csv");
  await page.getByRole("button", { name: "نمای کلی", exact: true }).click();
  await expect(page.locator(".stats")).toContainText("۱۰۰٬۰۰۰");
  await page.locator(".person-card").filter({ hasText: "سارا" }).click();
  await page.getByRole("button", { name: "تم تاریک", exact: true }).click();
  await page.getByRole("button", { name: "ثبت تراکنش", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator("#modal")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(27, 39, 34)");
  await page.screenshot({
    path: "test-results/v2-dark-entry.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page
    .getByRole("button", { name: "اتصال اختیاری به حساب دوست" })
    .click();
  await page.getByRole("button", { name: "ساخت لینک اتصال" }).click();
  const link = await page
    .getByLabel("لینک اتصال", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  const peerContext = await browser.newContext();
  const friend = await peerContext.newPage();
  await friend.goto(link);
  await signup(friend, `peer${seed}@example.com`, "سارا");
  await friend.getByRole("button", { name: "پذیرش و اتصال حساب" }).click();
  await expect(
    friend.getByRole("heading", { name: "حساب با یاشار" }),
  ).toBeVisible();
  await expect(friend.locator(".personal-balance-grid")).toContainText(
    "به یاشار بدهکارید",
  );
  await expect(friend.locator("#content")).not.toContainText(
    "یادداشت فقط برای من",
  );
  await friend.getByRole("button", { name: "ثبت تسویه", exact: true }).click();
  await saveEntry(friend);
  await expect(friend.locator(".personal-balance-grid")).toContainText(
    "حساب تسویه است",
  );
  await page.getByRole("button", { name: "تازه‌سازی", exact: true }).click();
  await expect(page.locator(".personal-balance-grid")).toContainText(
    "حساب تسویه است",
  );
  await page.getByRole("button", { name: "ویرایش دوست" }).click();
  await page.getByLabel("نام دوست", { exact: true }).fill("سارا رضایی");
  await page.getByLabel("بایگانی این حساب").check();
  await page.locator("#personal-settings-form button[type=submit]").click();
  await expect(page.locator("#content")).toContainText(
    "این حساب بایگانی شده است",
  );
  await page.getByRole("button", { name: "نمای کلی", exact: true }).click();
  await expect(page.locator(".person-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "دوستان و حساب‌ها", exact: true })
    .click();
  await page.getByLabel("وضعیت حساب دوستان").selectOption("archived");
  await expect(page.locator(".person-card")).toContainText("سارا رضایی");
  expect(errors).toEqual([]);
  await peerContext.close();
});
test("Dark, light and system themes persist and cover mobile overview", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "تم روشن", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "هماهنگ با دستگاه", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "تم تاریک", exact: true }).click();
  await page.getByRole("button", { name: "مشاهدهٔ نسخهٔ نمایشی" }).click();
  await expect(
    page.getByRole("heading", { name: "حساب با دوستان" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/v2-dark-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/v2-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "فهرست", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "دوستان و حساب‌ها", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "دوستان و حساب‌ها", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "دوستان و حساب‌های فردی" }),
  ).toBeVisible();
  await page.locator(".person-card").filter({ hasText: "سارا" }).click();
  await expect(
    page.getByRole("heading", { name: "حساب با سارا" }),
  ).toBeVisible();
});
