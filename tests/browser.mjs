import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_URL || "http://localhost:5178";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
async function step(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
async function clickAction(action) {
  await page.locator(`[data-action="${action}"]`).first().click();
}
async function addTask(name) {
  await page.getByRole("textbox", { name: "添加今日任务" }).fill(name);
  await page.locator("#quick-task button").click();
  await page.getByText(name, { exact: true }).waitFor();
}
await step("empty local homepage and no fake records", async () => {
  await page.goto(base);
  await page.getByText("今天继续往前一点。", { exact: true }).waitFor();
  assert.equal(await page.locator(".task-row").count(), 0);
});
await step("quick add, completion, undo, edit/manual duration", async () => {
  await addTask("常识课程");
  await addTask("资料分析练习");
  await page
    .getByRole("button", { name: "完成 常识课程", exact: true })
    .click();
  await page.locator(".task-row.completed").waitFor();
  await page
    .getByRole("button", { name: "取消完成 常识课程", exact: true })
    .click();
  await page
    .getByRole("button", { name: "编辑 常识课程", exact: true })
    .click();
  await page.locator("[name=manual_minutes]").fill("45");
  await page.locator("[name=estimated_minutes]").fill("60");
  await page.locator("[name=note]").fill("复习昨天的易错点");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await page.locator(".daily-summary").innerText(), /45min/);
});
await step("timer persists across refresh and saves once", async () => {
  await page
    .getByRole("button", { name: "计时 常识课程", exact: true })
    .click();
  await page.locator("#timer-value").waitFor();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.locator("#timer-value").waitFor();
  await clickAction("pause-timer");
  const value = await page.locator("#timer-value").innerText();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator("#timer-value").innerText(), value);
  await clickAction("end-timer");
  await page.locator(".timer-bar").waitFor({ state: "hidden" });
});
await step(
  "template creates daily task once, deletion does not resurrect",
  async () => {
    await page.locator('nav a[href="#settings"]').click();
    await clickAction("new-template");
    await page.locator("#template-form [name=title]").fill("每日复习错题");
    await page
      .getByRole("button", { name: "保存固定任务", exact: true })
      .click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await page.locator('nav a[href="#today"]').click();
    await page
      .getByRole("button", { name: "编辑 每日复习错题", exact: true })
      .click();
    await clickAction("delete-task");
    await page.locator("dialog").waitFor({ state: "hidden" });
    await page.reload();
    await page.locator("#quick-task").waitFor();
    assert.equal(
      await page.getByText("每日复习错题", { exact: true }).count(),
      0,
    );
  },
);
await step("rollover and history retain correct task date", async () => {
  await page
    .getByRole("button", { name: "编辑 资料分析练习", exact: true })
    .click();
  await clickAction("roll-task");
  await page.locator("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByText("资料分析练习", { exact: true }).count(),
    0,
  );
  await page.locator('nav a[href="#history"]').click();
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  if (!(await page.locator(`[data-date="${tomorrow}"]`).count()))
    await clickAction("next-month");
  await page.locator(`[data-date="${tomorrow}"]`).click();
  await page.getByText("资料分析练习", { exact: true }).waitFor();
});
await step(
  "multi-image preview, remove, save, search, tag, full-size viewer",
  async () => {
    await page.goto(base + "/#library/" + encodeURIComponent("行测"));
    await clickAction("new-material");
    await page.locator("#material-form [name=title]").fill("增长率易错点");
    await page
      .locator("#material-form [name=note]")
      .fill("注意现期量与基期量的转换。");
    await page.locator("#material-form [name=tags]").fill("增长率，错题");
    await page
      .locator("#image-files")
      .setInputFiles([
        "public/icon-192.png",
        "public/icon-512.png",
        "public/icon-192.png",
      ]);
    await page.getByText("已准备 3 张新图片", { exact: false }).waitFor();
    await page.locator("[data-action=remove-added]").last().click();
    assert.equal(await page.locator(".preview-image").count(), 2);
    await page.getByRole("button", { name: "保存资料", exact: true }).click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await page.getByRole("searchbox").fill("基期量");
    await page.locator("#tag-filter").selectOption("错题");
    assert.equal(await page.locator(".material-card").count(), 1);
    await page.locator(".material-card").click();
    await page.locator("[data-action=view-image]").first().click();
    await page.waitForFunction(
      () => document.querySelector("#full-image")?.naturalWidth > 0,
    );
    assert.equal(
      await page.locator("#full-image").evaluate((i) => i.naturalWidth),
      192,
    );
    await clickAction("next-image");
    await page.waitForFunction(
      () => document.querySelector("#full-image")?.naturalWidth === 512,
    );
    await clickAction("back-material");
    await clickAction("edit-material");
    await page.locator("[data-action=remove-existing]").first().click();
    await page.locator("#material-form [name=title]").fill("增长率复习笔记");
    await page.getByRole("button", { name: "保存资料", exact: true }).click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await page.reload();
    await page.locator(".material-card").waitFor();
    assert.match(await page.locator(".material-card").innerText(), /1 张图片/);
  },
);
await step(
  "375 / 390 / 430 / 1440 layouts with persistent local data",
  async () => {
    await page.goto(base + "/#today");
    for (const width of [375, 390, 430, 1440]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      await page.locator("#quick-task").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `horizontal overflow ${width}`,
      );
      await page.screenshot({
        path: `test-results/today-${width}.png`,
        fullPage: true,
      });
      for (const route of [
        "library/" + encodeURIComponent("行测"),
        "history",
        "settings",
      ]) {
        await page.goto(base + "/#" + route);
        await page.locator("main h1").waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} overflow ${width}`,
        );
      }
      await page.goto(base + "/#today");
    }
  },
);
await step(
  "dark theme, cloud configuration guard, delete material",
  async () => {
    await page.goto(base + "/#settings");
    await page.locator("#theme").selectOption("dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(25, 30, 27)');
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).color),'rgb(225, 232, 227)');
  await page.screenshot({
      path: "test-results/settings-dark.png",
      fullPage: true,
    });
    await page.locator("#theme").selectOption("light");
    await clickAction("login-screen");
    await page
      .locator("#cloud-config [name=url]")
      .fill("https://example.supabase.co");
    await page.locator("#cloud-config [name=key]").fill("sb_secret_test");
    await page
      .getByRole("button", { name: "保存并前往登录", exact: true })
      .click();
    await page
      .getByText("不能使用 secret key，请填写 publishable / anon key。", {
        exact: true,
      })
      .first()
      .waitFor();
    await clickAction("close-dialog");
    await page.goto(base + "/#library/" + encodeURIComponent("行测"));
    await page.locator(".material-card").click();
    await clickAction("delete-material");
    await page.locator("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".material-card").count(), 0);
  },
);
assert.deepEqual(errors, []);
await writeFile(
  "test-results/browser-report.json",
  JSON.stringify(
    { time: new Date().toISOString(), base, checks, errors },
    null,
    2,
  ),
);
await browser.close();
