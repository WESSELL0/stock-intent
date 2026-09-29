import { z } from "zod";
import { readJsonBody } from "../http/json";

const Completion = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullable(),
  message: z.object({ content: z.string().nullable() }) })).min(1) });

/** Pure transport for fault injection. Only the server-only provider supplies secrets. */
export async function fetchIntentJSON(config: { key: string; model: string; base: string },
  system: string, user: string, request: typeof fetch = fetch): Promise<string> {
  let url: URL;
  try { url = new URL(`${config.base.replace(/\/$/, "")}/chat/completions`); }
  catch { throw new Error("LLM_BASE_URL_INVALID"); }
  const localHTTP = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!localHTTP && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new Error("LLM_BASE_URL_INVALID");
  let response: Response;
  try {
    response = await request(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" }, max_tokens: 4096 }),
      signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "error" });
  } catch { throw new Error("LLM_REQUEST_FAILED"); }
  if (!response.ok) { await response.body?.cancel(); throw new Error("LLM_REQUEST_FAILED"); }
  try {
    const payload = Completion.parse(await readJsonBody(response, 128_000));
    if (payload.choices[0]!.finish_reason !== "stop") throw new Error();
    const content = payload.choices[0]!.message.content;
    if (!content || content.length > 24_000) throw new Error();
    return content;
  } catch { throw new Error("LLM_RESPONSE_INVALID"); }
}
