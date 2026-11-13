/**
 * End-to-end check of the whole POC through a real browser (calls the Claude API).
 * Needs both services running (see README) and Playwright: `npm i -D playwright`.
 *   node e2e/full-flow.cjs [dashboardUrl] [outDir]
 */
const { chromium } = require("playwright");
const DASH = process.argv[2] ?? "http://localhost:4100";
const OUT = process.argv[3] ?? ".";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const step = (msg) => console.log(`✓ ${msg}`);
  const idle = () =>
    page.waitForFunction(() => !document.querySelector("dashboard-chat")?.shadowRoot?.querySelector(".spinner"), null, { timeout: 240_000 });

  await page.goto(DASH);
  await page.locator(".frame").first().waitFor();
  const before = await page.locator(".frame").count();
  step(`dashboard rendered ${before} components`);

  const chat = page.locator("dashboard-chat");
  await chat.locator(".fab").click();
  await chat.locator(".tpl--blank").click();
  step("opened chat overlay and chose the blank template");

  const box = chat.locator("textarea");
  await box.fill("今天各設備類別的故障次數\n設備\t故障次數\n電扶梯\t4\n電梯\t\n閘門\t7\n廣播\tN/A\n空調\t2");
  await box.press("Enter");
  await chat.locator(".msg--assistant").nth(1).locator(".bubble").waitFor({ timeout: 240_000 });
  await idle();
  if (await chat.locator(".preview").count()) throw new Error("expected the agent to report data problems, not render a preview");
  step("agent reported data problems instead of rendering");

  await box.fill("電梯和廣播那兩列刪掉");
  await box.press("Enter");
  await chat.locator(".preview iframe").waitFor({ timeout: 240_000 });
  await idle();
  step("agent rendered a preview through the dashboard");
  await page.screenshot({ path: `${OUT}/e2e-preview.png` });

  await chat.locator(".btn--primary").click();
  await chat.locator(".place select").waitFor();
  const slot = await chat.locator(".place select option").nth(6).getAttribute("value");
  await chat.locator(".place select").selectOption(slot);
  await chat.locator(".place .btn").click();
  await chat.locator(".savebar .ok").filter({ hasText: "已放到頁面" }).waitFor();
  step(`saved to the library and placed into ${slot}`);

  await chat.locator('[aria-label="收合"]').click();
  await page.locator(".frame .ai-tag").first().waitFor({ timeout: 10_000 });
  step("dashboard shows the AI-made component");
  await page.screenshot({ path: `${OUT}/e2e-dashboard.png` });
  await browser.close();
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
