import assert from "node:assert/strict";
import test from "node:test";
import { JsonBodyError, readJsonBody } from "../src/lib/http/json";

test("JSON body limit counts actual UTF-8 bytes without trusting Content-Length", async () => {
  const body = JSON.stringify({ query: "经营改善" });
  const bytes = new TextEncoder().encode(body);
  assert.deepEqual(await readJsonBody(new Response(body), bytes.length), { query: "经营改善" });
  await assert.rejects(readJsonBody(new Response(body, { headers: { "content-length": "1" } }), bytes.length - 1),
    (e: unknown) => e instanceof JsonBodyError && e.status === 413);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 12)); controller.enqueue(bytes.slice(12)); controller.close();
  } });
  assert.deepEqual(await readJsonBody(new Response(stream), bytes.length), { query: "经营改善" });
});
test("malformed JSON, invalid UTF-8 and empty body return safe errors", async () => {
  for (const body of ["", "{private_payload", new Uint8Array([0xff])]) {
    await assert.rejects(readJsonBody(new Response(body), 100), (e: unknown) =>
      e instanceof JsonBodyError && e.status === 400 && e.message === "JSON请求无效");
  }
});
