import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCapture } from "../src/lib/finance/cli";
import { createFinanceRequester, type RequestFailure } from "../src/lib/finance/request";

test("finance retries transient faults at most three times and records one terminal failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-retry-test-"));
  try {
    for (const code of ["4001", "429", "5001", "NETWORK_ERROR", "CLI_CHILD_TIMEOUT", "RATE_LIMITED"]) {
      const failures: RequestFailure[] = []; const waits: number[] = []; let calls = 0; let retries = 0;
      const request = createFinanceRequester({ onFailure: f => failures.push(f), onRetry: () => { retries++; },
        sleep: async ms => { waits.push(ms); }, capture: async () => { calls++; throw new Error(code); } });
      assert.equal(await request(join(directory, `${code}.json`), [], "/test", "fixture"), null);
      assert.equal(calls, 4); assert.equal(retries, 3);
      assert.equal(failures.length, 1); assert.equal(failures[0]!.code, code);
      assert.ok(waits[0]! >= 500 && waits[0]! < 700 && waits[1]! >= 1000 && waits[2]! >= 2000);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("finance auth, unsupported and unknown errors do not retry or expose payloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-fault-test-"));
  try {
    for (const code of ["401", "403", "AUTH_FAILED", "3002", "private raw body with token"]) {
      let calls = 0; const failures: RequestFailure[] = [];
      const request = createFinanceRequester({ onFailure: f => failures.push(f), onRetry: () => assert.fail("unexpected retry"),
        capture: async () => { calls++; throw new Error(code); } });
      assert.equal(await request(join(directory, "missing.json"), [], "/test", "fixture"), null);
      assert.equal(calls, 1);
      assert.equal(failures[0]!.code, code.includes(" ") ? "REQUEST_FAILED" : code);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("resume reuses valid captures and refetches malformed, failed or truncated envelopes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-resume-test-"));
  const path = join(directory, "capture.json");
  try {
    let calls = 0;
    const request = createFinanceRequester({ onFailure: () => assert.fail("unexpected failure"), onRetry: () => {},
      capture: async (_args, output) => { calls++; await writeFile(output, JSON.stringify({ ok: true, data: { synthetic: true } })); return readCapture(output); } });
    const first = await request(path, [], "/test", "fixture");
    const resumed = await request(path, [], "/test", "fixture");
    assert.equal(calls, 1); assert.deepEqual(resumed, first);
    for (const invalid of ["invalid-json", '{"ok":false,"data":null}', '{"ok":true,"data":{},"meta":{"truncated":true}}']) {
      await writeFile(path, invalid);
      assert.deepEqual((await request(path, [], "/test", "fixture"))!.data, { synthetic: true });
    }
    assert.equal(calls, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
