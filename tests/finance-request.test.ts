import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCapture } from "../src/lib/finance/cli";
import { createFinanceRequester, type RequestFailure } from "../src/lib/finance/request";

test("finance retries transient faults at most three times and records one terminal failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-retry-test-"));
  try {
    for (const code of ["4001", "429", "UPSTREAM_HTTP_429", "5001", "NETWORK_ERROR", "CLI_CHILD_TIMEOUT", "RATE_LIMITED"]) {
      const failures: RequestFailure[] = []; const waits: number[] = []; let calls = 0; let retries = 0;
      const request = createFinanceRequester({ onFailure: f => failures.push(f), onRetry: () => { retries++; },
        sleep: async ms => { waits.push(ms); }, capture: async () => { calls++; throw new Error(code); } });
      assert.equal(await request(join(directory, `${code}.json`), [], "/test", "fixture"), null);
      assert.equal(calls, 4); assert.equal(retries, 3);
      assert.equal(failures.length, 1); assert.equal(failures[0]!.code, code);
      const base = /(?:429|4001|RATE_LIMIT)/.test(code) ? 2000 : 500;
      assert.ok(waits[0]! >= base && waits[0]! < base + 200 && waits[1]! >= base * 2 && waits[2]! >= base * 4);
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
test("resume reuses valid captures while changed requests preserve prior raw evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-resume-test-"));
  const path = join(directory, "capture.json");
  try {
    let calls = 0;
    const request = createFinanceRequester({ onFailure: () => assert.fail("unexpected failure"), onRetry: () => {},
      capture: async (_args, output) => { calls++; await writeFile(output, JSON.stringify({ ok: true, data: { synthetic: true } })); return readCapture(output); } });
    const first = await request(path, [], "/test", "fixture");
    const resumed = await request(path, [], "/test", "fixture");
    assert.equal(calls, 1); assert.deepEqual(resumed, first);
    assert.equal(first?.retrievedAt, resumed?.retrievedAt);
    const differentWindow = await request(path, ["--end-ms", "999999"], "/test", "fixture");
    assert.equal(calls, 2);
    assert.deepEqual(differentWindow?.data, { synthetic: true });
    assert.notEqual(differentWindow?.relative_path, first?.relative_path);
    assert.equal((await readCapture(first!.relative_path)).sha256, first?.sha256);
    const refreshedValuation = await request(path, ["--end-ms", "999999"], "/test", "fixture", "new-build");
    assert.equal(calls, 3);
    assert.deepEqual(refreshedValuation?.data, { synthetic: true });
    assert.notEqual(refreshedValuation?.relative_path, differentWindow?.relative_path);
    assert.equal((await readCapture(differentWindow!.relative_path)).sha256, differentWindow?.sha256);
    const indexPath = `${path}.request.json`;
    for (const invalid of ["invalid-json", '{"fingerprint":"incorrect"}', '{"fingerprint":"incorrect","sha256":"bad"}']) {
      await writeFile(indexPath, invalid);
      assert.deepEqual((await request(path, ["--end-ms", "999999"], "/test", "fixture", "new-build"))!.data, { synthetic: true });
    }
    assert.equal(calls, 6);
    assert.equal((await readCapture(first!.relative_path)).sha256, first?.sha256);
    const index = JSON.parse(await readFile(indexPath, "utf8")) as { retrieved_at: string; relative_path: string };
    assert.equal(index.relative_path, refreshedValuation?.relative_path);
    assert.equal(index.retrieved_at, (await request(path, ["--end-ms", "999999"], "/test", "fixture", "new-build"))?.retrievedAt);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed refresh leaves a prior capture and its hash intact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finance-refresh-failure-test-"));
  try {
    const path = join(directory, "capture.json");
    let fail = false;
    const request = createFinanceRequester({ onFailure: () => {}, onRetry: () => {},
      capture: async (_args, output) => {
        if (fail) { await writeFile(output, "partial response"); throw new Error("AUTH_FAILED"); }
        await writeFile(output, JSON.stringify({ ok: true, data: { value: 1 } }));
        return readCapture(output);
      } });
    const initial = (await request(path, [], "/test", "fixture"))!;
    fail = true;
    assert.equal(await request(path, [], "/test", "fixture", "new-build"), null);
    assert.equal((await readCapture(initial.relative_path)).sha256, initial.sha256);
    assert.deepEqual((await request(path, [], "/test", "fixture"))?.data, initial.data);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
