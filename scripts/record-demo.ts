import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.DEMO_BASE_URL || "https://stock-intent.vercel.app";
const directory = "artifacts/demo";
const output = join(directory, "stock-intent-final-demo.webm");
const reportPath = join(directory, "final-demo-report.json");
await mkdir(directory, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  recordVideo: { dir: directory, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
page.setDefaultTimeout(45_000);
const video = page.video();
const started = Date.now();
const milestones: Record<string, number> = {};
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
const holdUntil = async (second: number) => {
  const remaining = started + second * 1000 - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
};
async function caption(message: string) {
  await page.evaluate(text => {
    let element = document.getElementById("recording-caption");
    if (!element) {
      element = document.createElement("div");
      element.id = "recording-caption";
      Object.assign(element.style, {
        position: "fixed", top: "68px", right: "36px", width: "620px", zIndex: "2147483647",
        pointerEvents: "none", padding: "8px 12px", borderRadius: "6px",
        background: "rgba(16, 38, 46, 0.94)", color: "#fff", fontSize: "15px",
        fontWeight: "600", letterSpacing: "0.01em", boxShadow: "0 5px 24px rgba(0,0,0,0.2)",
      });
      document.body.appendChild(element);
    }
    element.textContent = text;
  }, message);
}
const mark = (name: string) => { milestones[name] = Math.round((Date.now() - started) / 1000); };

let success = false;
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await caption("真实产品演示：自然语言选股与逐项证据 · 沪深300");
  await holdUntil(5);

  const aiQuery = "找营业收入同比至少8%、市净率不高于2倍的沪深300公司";
  await page.locator("#query").fill(aiQuery);
  await page.getByRole("button", { name: "解析意图", exact: true }).click();
  await expect(page.locator(".condition-row")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "意图解释与澄清" })).toContainText("模型仅解释条件");
  await caption("DeepSeek只解释意图：非预设描述变成两条可编辑的金融条件");
  mark("real_llm_parsed");
  await holdUntil(18);

  const presetQuery = "找经营改善、估值合理、走势稳定的公司";
  await page.locator("#query").fill(presetQuery);
  await page.getByRole("button", { name: "解析意图", exact: true }).click();
  await expect(page.locator(".condition-row")).toHaveCount(5);
  await caption("模糊表达的默认解释公开展示；五条条件均可检查和修改");
  await page.locator(".condition-row").first().scrollIntoViewIfNeeded();
  mark("preset_five_conditions");
  await holdUntil(28);

  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("35");
  await caption("把PE TTM上限从30倍改为35倍，再运行真实数据筛选");
  mark("pe_edited");
  await holdUntil(36);
  await page.getByRole("button", { name: "确认并运行筛选" }).click();
  await page.waitForURL("**/results");
  await expect(page.locator(".summary-strip strong")).toHaveCount(4);
  await caption("固定快照：300只股票，PASS / FAIL / UNKNOWN分别计数");
  mark("real_screen_ran");
  await holdUntil(44);

  await page.locator("table tbody button").first().click();
  await page.locator(".evidence-panel").scrollIntoViewIfNeeded();
  await expect(page.locator(".evidence-panel")).toContainText("calculate_operating_income_yoy_growth_ratio");
  await caption("入选股票的每条证据包含实际值、阈值、来源、原始字段与数据时点");
  mark("pass_evidence_opened");
  await holdUntil(57);

  await page.getByRole("link", { name: /查看排除原因与条件变化/ }).click();
  await page.waitForURL("**/sensitivity");
  const near = page.getByRole("region", { name: "Near Miss", exact: true });
  await near.scrollIntoViewIfNeeded();
  await near.locator("tbody button").first().click();
  await caption("Near Miss只列数据完整的排除股票，并指出具体失败条件");
  mark("excluded_evidence_opened");
  await holdUntil(65);

  const unknown = page.getByRole("region", { name: "Unknown Data", exact: true });
  await unknown.scrollIntoViewIfNeeded();
  await expect(unknown).toContainText("无法判断");
  await caption("缺失数据单独列为UNKNOWN，不会伪装成失败或接近入选");
  mark("unknown_separated");
  await holdUntil(71);

  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("100");
  await page.getByRole("button", { name: "重新运行并比较" }).click();
  await page.getByTestId("sensitivity-count").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("sensitivity-count")).toContainText("→");
  await caption("同一Snapshot内比较条件变化：显示候选数量和新增股票");
  mark("same_snapshot_sensitivity");
  await holdUntil(80);

  await caption("所有数字来自真实快照和确定性程序；本工具不构成投资建议");
  await holdUntil(82);
  expect(errors).toEqual([]);
  success = true;
} finally {
  await context.close();
  if (video) await video.saveAs(success ? output : join(directory, "failed-recording.webm"));
  await browser.close();
  await writeFile(reportPath, JSON.stringify({ base_url: base, recorded_at: new Date().toISOString(),
    duration_wall_seconds: Math.round((Date.now() - started) / 1000), success, milestones, page_errors: errors,
    output: success ? output : null }, null, 2));
}
if (!success) throw new Error("DEMO_RECORDING_FAILED");
console.log(JSON.stringify({ output, report: reportPath, milestones, duration_wall_seconds: Math.round((Date.now() - started) / 1000) }));
