import { loadSnapshot } from "@/lib/snapshot/store";
import { snapshotSummary } from "@/lib/snapshot/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const snapshot = await loadSnapshot();
    if (!snapshot) return Response.json({ ready: false, message: "真实市场快照尚未就绪" }, { status: 503 });
    return Response.json(snapshotSummary(snapshot));
  } catch {
    return Response.json({ ready: false, message: "快照校验失败，未使用损坏的数据" }, { status: 500 });
  }
}
