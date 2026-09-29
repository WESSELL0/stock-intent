import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { captureFinance, readCapture, type CapturedResponse } from "../src/lib/finance/cli";
import { METRIC_IDS } from "../src/domain/metrics";
import { parseProviderNumber } from "../src/lib/finance/numeric";
import { calculateVolatility60d } from "../src/lib/finance/volatility";
import { FINANCIAL_FIELD_MAP } from "../src/lib/finance/provider-schemas";

const argv = process.argv.slice(2);
const offlineIndex = argv.indexOf("--offline-dir");
const offline = offlineIndex >= 0;
const directory = offline ? argv[offlineIndex + 1] : `data/verification/${new Date().toISOString().replace(/[:.]/g, "-")}`;
if (!directory || !/^data\/verification\/[a-zA-Z0-9_-]+$/.test(directory)) throw new Error("Expected a local data/verification/<run> directory");
const root: string = directory;
const reportArg = argv.indexOf("--report");
const report = z.string().regex(/^\d{4}-[1-4]$/).parse(reportArg >= 0 ? argv[reportArg + 1] : "2026-2");
const checks: Array<Record<string, unknown>> = [];
const warnings: string[] = [];
let transportFailures = 0;
let metricContractComplete = true;

async function query(label: string, args: string[]): Promise<CapturedResponse | null> {
  const path = join(root, `${label}.json`);
  try {
    const response = offline ? await readCapture(path) : await captureFinance(args, path);
    checks.push({ label, ok: true, source: "hithink-finance/fuyao", command: args, raw_path: response.relative_path, sha256: response.sha256 });
    return response;
  } catch (error) {
    const message = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "RESPONSE_OR_CONTRACT_ERROR";
    checks.push({ label, ok: false, error: message });
    transportFailures += 1;
    console.log(`${label}: failed (${message})`);
    return null;
  }
}

const Stock = z.object({ thscode: z.string(), ticker: z.string(), name: z.string() });
const Items = z.object({ timestamp: z.number(), item: z.array(Stock) });
const indexSearch = await query("index-search", ["symbol", "search", "--q", "沪深300", "--asset-type", "a-share-index", "--limit", "5"]);
const resolved = indexSearch && Items.parse(indexSearch.data).item.find(row => row.name === "沪深300" && row.thscode === "000300.SH");
if (!resolved) throw new Error("INDEX_NOT_RESOLVED");
const membersCapture = await query("constituents", ["index", "constituents", "--thscode", resolved.thscode]);
const calendarCapture = await query("calendar", ["market", "calendar"]);
if (!membersCapture || !calendarCapture) throw new Error("REQUIRED_DATA_UNAVAILABLE");
const members = Items.parse(membersCapture.data);
if (new Set(members.item.map(r => r.thscode)).size !== members.item.length || members.item.length !== 300) {
  metricContractComplete = false; warnings.push("成分股数量或唯一性异常，需要核对股票池版本");
}
const preferred = ["600519.SH", "000001.SZ", "300750.SZ"];
const samples = preferred.filter(code => members.item.some(row => row.thscode === code));
if (samples.length !== 3) { metricContractComplete = false; warnings.push("部分预设验证样本不在当前成分内，未虚构或补入"); }
const calendar = z.object({ timestamp: z.number(), item: z.array(z.object({ date_ms: z.number(), date: z.string().regex(/^\d{8}$/) })) }).parse(calendarCapture.data);
// Freeze cutoff against the captured response date; do not turn old offline probes into current data.
const cutoff = new Date(calendar.timestamp);
const shanghai = new Date(cutoff.getTime() + 8 * 3600_000);
const today = shanghai.toISOString().slice(0, 10).replaceAll("-", "");
const afterClose = shanghai.getUTCHours() * 60 + shanghai.getUTCMinutes() >= 15 * 60 + 30;
const days = calendar.item.filter(day => day.date < today || (day.date === today && afterClose)).sort((a, b) => a.date_ms - b.date_ms);
if (days.length < 80) throw new Error("INSUFFICIENT_CALENDAR");

const valuationCapture = await query("valuations", ["valuation", "snapshot", "--thscodes", samples.join(",")]);
let valuationCount = 0;
if (valuationCapture) {
  const values = z.object({ timestamp: z.number().nullable(), total: z.number(), item: z.array(Stock.extend({ name: z.string().nullable(), pe_ttm: z.number().nullable(), pb_mrq: z.number().nullable() })) }).parse(valuationCapture.data);
  valuationCount = values.item.length;
  if (values.total !== samples.length || samples.some(code => !values.item.some(row => row.thscode === code))) metricContractComplete = false;
  warnings.push("估值 timestamp 是批次最大上游时间；不提供逐字段更新时间或具体财报期");
}
const financialCoverage: Record<string, Record<string, string>> = {};
const incomeCoverage: Record<string, { rows: number; target_period_present: boolean; prior_period_present: boolean }> = {};
const observedGrowthFields = new Set<string>();
for (const code of samples) {
  const capture = await query(`financials-${code}`, ["financials", "indicators", "--thscode", code, "--report", report]);
  if (!capture) continue;
  const financials = z.object({ thscode: z.literal(code), report: z.literal(report), abilities: z.array(z.object({ ability: z.string(), indicators: z.array(z.object({ index_id: z.string(), value: z.string().nullable() })) })) }).parse(capture.data);
  const fields = financials.abilities.flatMap(a => a.indicators);
  financials.abilities.filter(a => a.ability === "growth").flatMap(a => a.indicators).forEach(v => observedGrowthFields.add(v.index_id));
  financialCoverage[code] = {};
  for (const metric of METRIC_IDS.slice(0, 4)) {
    const rawField = FINANCIAL_FIELD_MAP[metric as keyof typeof FINANCIAL_FIELD_MAP];
    const matches = fields.filter(v => v.index_id === rawField);
    const status = !matches.length ? "absent" : matches.length > 1 ? "conflict" : parseProviderNumber(matches[0]!.value) === null ? "null" : "available";
    financialCoverage[code][metric] = status;
    if (status === "absent" || status === "conflict") metricContractComplete = false;
  }
  // Verify raw fallback availability without claiming a validated growth mapping.
  const incomeCapture = await query(`income-${code}`, ["financials", "income", "--thscode", code, "--period", "quarterly", "--limit", "8"]);
  if (incomeCapture) {
    const income = z.object({ item: z.array(z.object({
      thscode: z.literal(code), fiscal_year: z.number().int(), fiscal_period: z.enum(["FY", "Q1", "Q2", "Q3", "Q4"]),
      report_date_ms: z.number(), period_end_ms: z.number(), currency: z.literal("CNY"),
      operating_income: z.number().nullable(), net_profit: z.number().nullable(), parent_holder_net_profit: z.number().nullable(),
    })) }).parse(incomeCapture.data);
    const [year, quarter] = report.split("-").map(Number);
    const target = (fiscalYear: number) => income.item.find(row => row.fiscal_year === fiscalYear && (row.fiscal_period === `Q${quarter}` || (quarter === 4 && row.fiscal_period === "FY")));
    const current = target(year!), prior = target(year! - 1);
    incomeCoverage[code] = { rows: income.item.length, target_period_present: Boolean(current), prior_period_present: Boolean(prior) };
    if (!current || !prior) { metricContractComplete = false; warnings.push(`${code}: 利润表缺少可配对报告期`); }
    if (current && prior && current.report_date_ms === prior.report_date_ms) warnings.push(`${code}: 本期/比较期披露日相同，重述或披露时间语义待核验`);
  }
}
warnings.push("财务 indicators 未提供披露日；不得将取数时间冒充披露时间");
if ([...observedGrowthFields].some(id => id.includes("parent_holder"))) warnings.push("归母净利润同比使用明确字段映射；不得表述为合并净利润同比");

const sampleCode = samples[0];
let volatility: ReturnType<typeof calculateVolatility60d> | null = null;
if (sampleCode) {
  const first = days.at(-80)!, last = days.at(-1)!;
  const capture = await query(`history-${sampleCode}`, ["market", "history", "--thscode", sampleCode, "--start-ms", String(first.date_ms), "--end-ms", String(last.date_ms + 86399999), "--adjust", "forward"]);
  if (capture) {
    const history = z.object({ thscode: z.literal(sampleCode), adjust: z.literal("forward"), item: z.array(z.object({ date_ms: z.number(), close_price: z.number() })) }).parse(capture.data);
    const date = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
    volatility = calculateVolatility60d(history.item.map(b => ({ date: date(b.date_ms), close: b.close_price })), days.map(d => date(d.date_ms)));
    if (volatility.status !== "ok") metricContractComplete = false;
    console.log(`history: ${history.item.length} bars; volatility calculation: ${volatility.status}`);
  }
}
const summary = {
  checked_at: new Date().toISOString(), mode: offline ? "offline_replay_of_real_capture" : "live",
  report_period: report, transport_ok: transportFailures === 0, metric_contract_complete: metricContractComplete,
  universe_count: members.item.length, calendar_count: calendar.item.length, valuation_count: valuationCount,
  financial_coverage: financialCoverage, income_coverage: incomeCoverage, observed_growth_fields: [...observedGrowthFields], volatility,
  warnings, checks,
};
await mkdir(root, { recursive: true });
const summaryFile = join(root, offline ? "verification-replay-summary.json" : "verification-summary.json");
await writeFile(summaryFile, JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ report: summaryFile, transport_ok: summary.transport_ok, metric_contract_complete: metricContractComplete, universe_count: members.item.length, financial_sample_count: Object.keys(financialCoverage).length }, null, 2));
process.exitCode = transportFailures ? 1 : metricContractComplete ? 0 : 2;
