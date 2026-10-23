import { test, expect } from "@playwright/test";
test("Persian demo renders on desktop and mobile without overflow", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "مشاهدهٔ نسخهٔ نمایشی" }).click();
  await page.locator(".groupnav").filter({ hasText: "سفر به شمال" }).click();
  await expect(
    page.getByRole("heading", { name: "سفر به شمال" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("textbox", { name: "جست‌وجوی هزینه" }).fill("شام");
  await expect(page.locator(".expense-row")).toHaveCount(1);
  await page.getByRole("textbox", { name: "جست‌وجوی هزینه" }).fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/mobile.png",
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
test("Two friends register, join, split a bill, comment, settle and export", async ({
  page,
  browser,
}) => {
  const seed = Date.now(),
    email = `y${seed}@example.com`,
    email2 = `s${seed}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "ساخت حساب", exact: true }).click();
  await page.getByLabel("نام شما").fill("یاشار");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("correct-password-123");
  await page.locator("#auth-form button[type=submit]").click();
  await page.getByRole("button", { name: "کلید را ذخیره کردم" }).click();
  await page.getByRole("button", { name: "ساخت اولین گروه" }).click();
  await page.getByLabel("اسم گروه").fill("تست سفر دوستان");
  await expect(page.getByLabel("نوع گروه").locator("option")).toHaveText([
    "✈️ سفر",
    "🏡 خانه و هم‌خانه‌ها",
    "☕ دورهمی دوستانه",
    "🌴 تفریح و تعطیلات",
    "🎉 جشن و مناسبت",
  ]);
  await page.getByLabel("نوع گروه").selectOption("🏡");
  await page.locator("#group-form button[type=submit]").click();
  const invite = await page.getByLabel("لینک دعوت تست سفر دوستان").inputValue();
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  const other = await browser.newContext();
  const friend = await other.newPage();
  await friend.goto(invite);
  await friend.getByRole("button", { name: "ساخت حساب", exact: true }).click();
  await friend.getByLabel("نام شما").fill("سارا");
  await friend.getByLabel("ایمیل", { exact: true }).fill(email2);
  await friend
    .getByLabel("رمز عبور", { exact: true })
    .fill("correct-password-456");
  await friend.locator("#auth-form button[type=submit]").click();
  await friend.getByRole("button", { name: "کلید را ذخیره کردم" }).click();
  await friend
    .getByRole("button", { name: "پیوستن به گروه", exact: true })
    .click();
  await expect(
    friend.getByRole("heading", { name: "تست سفر دوستان" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تازه‌سازی", exact: true }).click();
  await page.getByRole("button", { name: "هزینهٔ جدید", exact: true }).click();
  await page.getByLabel("بابت چی هزینه کردید؟").fill("شام دونفره");
  await page.getByLabel("مبلغ کل").fill("۱۰۰۰۰۱");
  await page.getByLabel("عکس رسید (اختیاری)").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOy8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(
    page.locator(".expense-row").filter({ hasText: "شام دونفره" }),
  ).toBeVisible();
  await friend.getByRole("button", { name: "تازه‌سازی", exact: true }).click();
  await friend
    .locator(".expense-row")
    .filter({ hasText: "شام دونفره" })
    .click();
  await expect(friend.locator(".receipt")).toBeVisible();
  await friend.getByLabel("نظر شما").fill("حساب دقیق است، ممنون!");
  await friend.locator("#comment-form button[type=submit]").click();
  await expect(friend.locator(".comment")).toContainText(
    "حساب دقیق است، ممنون!",
  );
  await friend.getByRole("button", { name: "بستن", exact: true }).click();
  await friend.getByRole("button", { name: "مشاهده و تسویه" }).click();
  await friend.getByRole("button", { name: "ثبت", exact: true }).click();
  await friend
    .getByRole("button", { name: "پرداخت انجام شده؛ ثبت کن" })
    .click();
  await expect(friend.locator(".stat.featured")).toContainText(
    "همه‌چیز صاف و ساده است",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی CSV" }).click();
  expect((await download).suggestedFilename()).toBe("dong-export.csv");
  await page.getByRole("button", { name: "هزینهٔ جدید", exact: true }).click();
  await page.getByLabel("بابت چی هزینه کردید؟").fill("صورتحساب اقلام");
  await page
    .getByRole("button", { name: "تقسیم ریزِ اقلام", exact: true })
    .click();
  const helper = page.locator("dialog").last();
  await helper.getByLabel("نام قلم").fill("پیتزا");
  await helper.getByLabel("مبلغ کل این قلم").fill("100000");
  await helper.getByRole("button", { name: "اعمال مبلغ و سهم‌ها" }).click();
  await expect(page.locator("#amount")).toHaveValue("100000");
  await expect(page.locator("#mode")).toHaveValue("exact");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "گزارش‌ها", exact: true }).click();
  await page.getByRole("button", { name: "ورود CSV", exact: true }).click();
  await page.locator("#import-file").setInputFiles({
    name: "expenses.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,title,amount,currency,payer,participants,category\n2026-01-01,هزینه واردشده,50000,IRT,یاشار,یاشار|سارا,food",
    ),
  });
  await expect(page.locator("#import-preview")).toContainText("هزینه واردشده");
  await page.locator("#import-form button[type=submit]").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.locator(".groupnav").filter({ hasText: "تست سفر دوستان" }).click();
  await expect(
    page.locator(".expense-row").filter({ hasText: "هزینه واردشده" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "هزینهٔ جدید", exact: true }).click();
  await page
    .getByRole("button", { name: "تبدیل با نرخ دلخواه", exact: true })
    .click();
  const conversion = page.locator("dialog").last();
  await conversion.getByLabel("مبلغ اصلی", { exact: true }).fill("2");
  await conversion.getByLabel("هر واحد پول اصلی، چند تومان است؟").fill("50000");
  await conversion.getByRole("button", { name: "محاسبه و اعمال مبلغ" }).click();
  await expect(page.locator("#amount")).toHaveValue("100000");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await other.close();
});
