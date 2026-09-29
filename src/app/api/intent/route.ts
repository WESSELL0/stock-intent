import { z } from "zod";
import { interpretNaturalLanguage } from "@/lib/ai/interpret";
import { llmConfigured } from "@/lib/ai/provider";
import { presetIntent } from "@/domain/preset-intent";
import { JsonBodyError, readJsonBody } from "@/lib/http/json";

export const runtime = "nodejs";
const Input = z.strictObject({ original_query: z.string().trim().min(1).max(2000) });
export function GET() { return Response.json({ configured: llmConfigured() }); }
export async function POST(request: Request) {
  try {
    const input = Input.parse(await readJsonBody(request, 16_000));
    const preset = presetIntent(input.original_query);
    if (preset) return Response.json({ interpreter: "preset", intent: preset });
    if (!llmConfigured()) return Response.json({ error: "真实LLM尚待配置；此描述包含预设以外的要求，未套用默认条件。可使用完整示例或配置模型后重试。" }, { status: 503 });
    return Response.json({ interpreter: "llm", intent: await interpretNaturalLanguage(input.original_query) });
  } catch (error) {
    if (error instanceof JsonBodyError) return Response.json({ error: error.message }, { status: error.status });
    const code = error instanceof Error ? error.message : "LLM_REQUEST_FAILED";
    const message = code === "LLM_INTENT_SCHEMA_INVALID" || code === "LLM_QUERY_MISMATCH"
      ? "模型解析失败：输出不符合指标白名单或意图结构，请修改描述后重试" :
      code === "LLM_REQUEST_FAILED" ? "模型服务暂时不可用，请稍后重试" : "意图输入或模型输出无效";
    return Response.json({ error: message }, { status: code === "LLM_REQUEST_FAILED" ? 502 : 400 });
  }
}
