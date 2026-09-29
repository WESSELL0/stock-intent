import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { captureFinance, readCapture, type CapturedResponse } from "./cli";

export type Capture = CapturedResponse & { retrievedAt: string };
export type RequestFailure = { code: string; endpoint: string; target: string };
const safeCode = (error: unknown) => error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "REQUEST_FAILED";
const retryable = (code: string) => /^(?:4001|429|5\d{2,3}|(?:HTTP_|API_|UPSTREAM_HTTP_)(?:429|5\d{2,3})|NETWORK_ERROR|NETWORK_UNAVAILABLE|TIMEOUT|REQUEST_TIMEOUT|CLI_CHILD_TIMEOUT|RATE_LIMITED|RATE_LIMIT_EXCEEDED)$/.test(code);
const rateLimited = (code: string) => /(?:429|4001|RATE_LIMIT)/.test(code);

export function createFinanceRequester(options: {
  onFailure: (failure: RequestFailure) => void;
  onRetry: () => void;
  capture?: typeof captureFinance;
  sleep?: (ms: number) => Promise<void>;
}) {
  const capture = options.capture ?? captureFinance;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  return async (path: string, args: string[], endpoint: string, target: string, cacheScope = ""): Promise<Capture | null> => {
    const fingerprint = createHash("sha256").update(JSON.stringify({ args, endpoint, target, cacheScope })).digest("hex");
    const metadataPath = `${path}.request.json`;
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        fingerprint?: string; sha256?: string; relative_path?: string; retrieved_at?: string };
      if (metadata.fingerprint !== fingerprint) throw new Error("CACHE_REQUEST_MISMATCH");
      // Legacy index entries used the logical path itself. Keep them readable without rewriting it.
      const existing = await readCapture(metadata.relative_path ?? path);
      if (metadata.sha256 !== existing.sha256) throw new Error("CACHE_CONTENT_MISMATCH");
      return { ...existing, retrievedAt: metadata.retrieved_at ?? (await stat(existing.relative_path)).mtime.toISOString() };
    }
    catch { /* Only valid, complete envelopes count as a resumable capture. */ }
    for (let attempt = 1; attempt <= 4; attempt++) {
      const captureDirectory = join(dirname(path), ".captures", basename(path, ".json"));
      const temporaryCapture = join(captureDirectory, `.pending-${process.pid}-${randomUUID()}.json`);
      try {
        await mkdir(captureDirectory, { recursive: true, mode: 0o700 });
        await capture(args, temporaryCapture);
        const captured = await readCapture(temporaryCapture);
        const retrievedAt = new Date().toISOString();
        const immutablePath = join(captureDirectory, `${fingerprint}-${captured.sha256}.json`);
        try { await link(temporaryCapture, immutablePath); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        const response = await readCapture(immutablePath);
        if (response.sha256 !== captured.sha256) throw new Error("CAPTURE_HASH_MISMATCH");
        const tempIndex = `${metadataPath}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(tempIndex, JSON.stringify({ fingerprint, sha256: response.sha256,
          relative_path: immutablePath, retrieved_at: retrievedAt }), { mode: 0o600 });
        await rename(tempIndex, metadataPath);
        return { ...response, retrievedAt };
      } catch (error) {
        const code = safeCode(error);
        if (attempt < 4 && retryable(code)) {
          options.onRetry();
          await sleep((rateLimited(code) ? 2000 : 500) * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
          continue;
        }
        options.onFailure({ code, endpoint, target });
        return null;
      } finally {
        await unlink(temporaryCapture).catch(() => {});
      }
    }
    return null;
  };
}
