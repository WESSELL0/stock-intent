import { llmConfigured } from "@/lib/ai/provider";
import { loadSnapshot } from "@/lib/snapshot/store";
import { snapshotFreshness } from "@/lib/snapshot/freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await loadSnapshot();
    if (!snapshot) return Response.json({ status: "unavailable", screening_ready: false,
      llm_configured: llmConfigured(), reason: "真实市场快照尚未就绪" }, { status: 503 });
    return Response.json({ status: snapshot.status, screening_ready: true,
      snapshot_id: snapshot.snapshot_id, stock_count: snapshot.stocks.length,
      market_date: snapshot.market_date, report_period: snapshot.report_period,
      freshness: snapshotFreshness(snapshot.market_date),
      llm_configured: llmConfigured() });
  } catch {
    return Response.json({ status: "error", screening_ready: false,
      llm_configured: llmConfigured(), reason: "快照校验失败" }, { status: 500 });
  }
}
