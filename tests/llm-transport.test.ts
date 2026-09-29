import assert from "node:assert/strict";
import test from "node:test";
import { fetchIntentJSON } from "../src/lib/ai/transport";

// Deliberately fake credentials and responses, never evidence of a live model call.
const config = { key: "synthetic-test-secret", model: "test-model", base: "https://model.example.test/v1" };
test("model request contains only prompt and user text, and disallows redirects", async () => {
  const mock: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://model.example.test/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${config.key}`);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.messages, [{ role: "system", content: "system" }, { role: "user", content: "query" }]);
    assert.equal(String(init?.body).includes(config.key), false);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"valid":"transport-only"}' } }] });
  };
  assert.equal(await fetchIntentJSON(config, "system", "query", mock), '{"valid":"transport-only"}');
});
test("authentication, throttling, upstream and network errors never expose raw payloads", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(fetchIntentJSON(config, "s", "u", async () => new Response(config.key, { status })),
      { message: "LLM_REQUEST_FAILED" });
  }
  await assert.rejects(fetchIntentJSON(config, "s", "u", async () => { throw new Error(config.key); }), { message: "LLM_REQUEST_FAILED" });
});
test("malformed, truncated, refused and oversized completions are rejected", async () => {
  const bad = [new Response("not-json"), Response.json({ choices: [] }),
    ...["length", "content_filter", null].map(finish_reason => Response.json({ choices: [{ finish_reason, message: { content: "{}" } }] })),
    Response.json({ choices: [{ finish_reason: "stop", message: { content: null } }] }),
    Response.json({ choices: [{ finish_reason: "stop", message: { content: "x".repeat(24_001) } }] }),
    new Response("x".repeat(128_001))];
  for (const response of bad) await assert.rejects(fetchIntentJSON(config, "s", "u", async () => response), { message: "LLM_RESPONSE_INVALID" });
});
test("unsafe model endpoints are rejected before any request", async () => {
  for (const base of ["http://external.example", "ftp://localhost", "https://user:pass@example.test", "https://example.test?key=secret"]) {
    await assert.rejects(fetchIntentJSON({ ...config, base }, "s", "u", async () => { assert.fail("must not send"); }),
      { message: "LLM_BASE_URL_INVALID" });
  }
});
