import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSnapshot } from "../src/lib/snapshot/store";
import { screenSnapshot } from "../src/domain/screen";
import { INITIAL_PRESETS } from "../src/domain/presets";
import { presetIntent } from "../src/domain/preset-intent";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3107";
const directory = "artifacts/acceptance";
await mkdir(directory, { recursive: true });
const snapshot = await loadSnapshot();
if (!snapshot) throw new Error("Real snapshot required for this acceptance run");
const expected = (cap: number) => screenSnapshot(snapshot, INITIAL_PRESETS.map(c => c.id === "valuation-cap" ? { ...c, threshold: cap } : c));
const passCount = (cap: number) => expected(cap).results.filter(row => row.status === "PASS").length;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
const proof: Record<string, unknown> = { base_url: base, tested_at: new Date().toISOString(),
  snapshot_id: snapshot.snapshot_id, real_llm_verified: false, checks: [] };
const check = (name: string) => (proof.checks as string[]).push(name);
const example = "找经营改善、估值合理、走势稳定的公司";
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#query").fill(example);
  await page.getByRole("button", { name: "解析意图", exact: true }).click();
  await expect(page.locator(".condition-row")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "意图解释与澄清" })).toContainText("规则预设 · 未调用模型");
  await expect(page.getByRole("region", { name: "意图解释与澄清" }).locator("li")).toHaveCount(3);
  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("35");
  await page.screenshot({ path: join(directory, "intent.png"), fullPage: true });
  await page.getByRole("button", { name: "确认并运行筛选" }).click();
  await page.waitForURL("**/results");
  const run35 = expected(35);
  const counts = [300, passCount(35), run35.results.filter(r => r.status === "FAIL").length, run35.results.filter(r => r.status === "UNKNOWN").length];
  await expect(page.locator(".summary-strip strong")).toHaveText(counts.map(String));
  await expect(page.getByRole("region", { name: "数据状态" })).toContainText(snapshot.snapshot_id);
  await page.locator("table tbody button").first().click();
  await expect(page.locator(".evidence-panel")).toContainText("calculate_operating_income_yoy_growth_ratio");
  await expect(page.locator(".evidence-panel")).toContainText("PASS");
  await page.screenshot({ path: join(directory, "results.png"), fullPage: true });
  proof.counts = counts;
  check("real snapshot: preset, assumptions, PE edit, PASS and evidence");
  await page.getByRole("link", { name: /查看排除原因与条件变化/ }).click();
  await page.waitForURL("**/sensitivity");
  await expect(page.getByTestId("sensitivity-count")).toHaveText(`${passCount(30)} → ${passCount(35)}`);
  const near = page.getByRole("region", { name: "Near Miss", exact: true });
  const unknown = page.getByRole("region", { name: "Unknown Data", exact: true });
  proof.near_miss_rows = await near.locator("tbody tr").count();
  proof.unknown_rows = await unknown.locator("tbody tr").count();
  await expect(unknown).toContainText("无法判断");
  await near.locator("tbody button").first().click();
  await expect(page.locator(".evidence-panel")).toContainText("FAIL");
  await page.screenshot({ path: join(directory, "sensitivity-35.png"), fullPage: true });
  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("100");
  await expect(page.locator(".change-description")).toContainText("<=35x");
  const screenResponse = page.waitForResponse(response => response.url().endsWith("/api/screen") && response.request().method() === "POST");
  await page.getByRole("button", { name: "重新运行并比较" }).click();
  const screen = await (await screenResponse).json();
  await expect(page.getByTestId("sensitivity-count")).toHaveText(`${passCount(30)} → ${passCount(100)}`);
  expect(screen.snapshot.snapshot_id).toBe(screen.sensitivity.snapshot_id);
  expect(screen.snapshot.coverage.pe_ttm).toBe(300);
  expect(screen.sensitivity.newly_included).toEqual(expected(100).results.filter(r => r.status === "PASS" && !expected(30).results.some(b => b.stock.thscode === r.stock.thscode && b.status === "PASS")).map(r => r.stock.thscode).sort());
  await page.screenshot({ path: join(directory, "sensitivity-100.png"), fullPage: true });
  check("real snapshot: FAIL/UNKNOWN separation and exact same-snapshot sensitivity sets");
  await page.getByRole("button", { name: /删除 归母净利润同比增长率/ }).click();
  await page.getByRole("combobox", { name: "新增条件指标" }).selectOption("sale_gross_margin");
  await page.getByRole("button", { name: "添加白名单条件" }).click();
  await expect(page.locator(".condition-row")).toHaveCount(5);
  await page.getByRole("combobox", { name: "valuation-cap 运算符", exact: true }).selectOption("<");
  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("-1");
  await expect(page.getByRole("button", { name: "重新运行并比较" })).toBeDisabled();
  check("condition add/delete/operator and conflict blocking");
  await page.getByRole("link", { name: /意图与条件/ }).click();
  await page.locator("#query").fill(example + "，不要银行");
  await expect(page.locator(".condition-row")).toHaveCount(0);
  check("query edit invalidates prior parsed conditions and results");
  const configured = await page.evaluate(async () => (await fetch("/api/intent")).json());
  if (!configured.configured) {
    await page.getByRole("button", { name: "解析意图", exact: true }).click();
    await expect(page.locator(".form-error[role=alert]")).toContainText("未套用默认条件");
    await expect(page.locator(".condition-row")).toHaveCount(0);
    check("no model: appended requirement explicitly fails instead of using preset");
  }
  if (configured.configured) {
    const liveQuery = "找营业收入同比至少8%、市净率不高于2倍的沪深300公司";
    await page.locator("#query").fill(liveQuery);
    await page.getByRole("button", { name: "解析意图", exact: true }).click();
    await expect(page.getByRole("region", { name: "意图解释与澄清" })).toContainText("模型仅解释条件", { timeout: 45_000 });
    await expect(page.locator(".condition-row")).toHaveCount(2);
    await expect(page.locator(".condition-row").first()).toContainText("AI解释");
    await page.getByRole("button", { name: "确认并运行筛选" }).click();
    await page.waitForURL("**/results");
    await expect(page.locator(".panel table thead th")).toHaveText(["股票", "营业收入同比增长率", "PB MRQ", "结果", "证据"]);
    const liveCounts = (await page.locator(".summary-strip strong").allTextContents()).map(Number);
    expect(liveCounts[0]).toBe(300);
    expect(liveCounts[1]! + liveCounts[2]! + liveCounts[3]!).toBe(300);
    proof.live_llm_counts = liveCounts;
    proof.real_llm_verified = true;
    await page.screenshot({ path: join(directory, "live-llm-results.png"), fullPage: true });
    await page.getByRole("link", { name: /意图与条件/ }).click();
    check("live DeepSeek interpretation, browser run and real snapshot evidence");
  }
  const oversized = await page.evaluate(async () => (await fetch("/api/intent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_query: "x".repeat(17_000) }),
  })).status);
  expect(oversized).toBe(413);
  const invalid = await page.evaluate(async () => (await fetch("/api/screen", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid-json",
  })).status);
  expect(invalid).toBe(400);
  check("live HTTP routes reject oversized and malformed requests");

  // UI contract tests use explicit synthetic model responses. They do not validate a real LLM.
  let contract = "unsupported";
  await page.route("**/api/intent", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const query = route.request().postDataJSON().original_query;
    const intent = presetIntent(example)!;
    intent.original_query = query;
    intent.conditions = intent.conditions.map(c => ({ ...c, origin: "ai_interpretation" as const }));
    if (contract === "unsupported") {
      intent.needs_clarification = true;
      intent.unsupported_requests = [{ phrase: "不要银行", reason: "metric_not_supported", explanation: "行业筛选暂未支持（合成UI测试）" }];
    }
    await route.fulfill({ json: { interpreter: "llm", intent } });
  });
  await page.getByRole("button", { name: "解析意图", exact: true }).click();
  await expect(page.getByRole("region", { name: "意图解释与澄清" })).toContainText("行业筛选暂未支持");
  await expect(page.getByRole("button", { name: "确认并运行筛选" })).toBeDisabled();
  await expect(page.locator(".condition-row").first()).toContainText("AI解释");
  await page.getByRole("spinbutton", { name: "valuation-cap 阈值", exact: true }).fill("35");
  await expect(page.getByRole("button", { name: "确认并运行筛选" })).toBeDisabled();
  check("synthetic UI contract: unsupported remains blocked after threshold edit; AI origin and assumptions shown");
  contract = "executable";
  await page.locator("#query").fill("合成UI测试：明确条件");
  await page.getByRole("button", { name: "解析意图", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认并运行筛选" })).toBeEnabled();
  check("synthetic UI contract: clarified intent becomes executable");
  await page.unroute("**/api/intent");
  expect(errors).toEqual([]);
  proof.page_errors = errors;
  proof.all_checks_pass = true;
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await writeFile(join(directory, "browser.json"), JSON.stringify(proof, null, 2));
  await browser.close();
}
