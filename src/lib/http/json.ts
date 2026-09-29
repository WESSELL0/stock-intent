export class JsonBodyError extends Error {
  constructor(public status: 400 | 413, message: string) { super(message); }
}

/** Enforce actual UTF-8 bytes, including requests without Content-Length. */
export async function readJsonBody(request: Request | Response, limit: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit) throw new JsonBodyError(413, "请求过大");
  const reader = request.body?.getReader();
  if (!reader) throw new JsonBodyError(400, "JSON请求无效");
  let size = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new JsonBodyError(413, "请求过大"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw new JsonBodyError(400, "JSON请求无效");
  } finally { reader.releaseLock(); }
}
