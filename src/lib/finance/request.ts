import { createHash } from "node:crypto";
import { stat, readFile, rename, writeFile } from "node:fs/promises";
import { captureFinance, readCapture, type CapturedResponse } from "./cli";

export type Capture = CapturedResponse & { retrievedAt: string };
export type RequestFailure = { code: string; endpoint: string; target: string };
const safeCode = (error: unknown) => error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "REQUEST_FAILED";
const retryable = (code: string) => /^(?:4001|429|5\d{2,3}|(?:HTTP_|API_)(?:429|5\d{2,3})|NETWORK_ERROR|NETWORK_UNAVAILABLE|TIMEOUT|REQUEST_TIMEOUT|CLI_CHILD_TIMEOUT|RATE_LIMITED|RATE_LIMIT_EXCEEDED)$/.test(code);

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
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { fingerprint?: string; sha256?: string };
      if (metadata.fingerprint !== fingerprint) throw new Error("CACHE_REQUEST_MISMATCH");
      const existing = await readCapture(path);
      if (metadata.sha256 !== existing.sha256) throw new Error("CACHE_CONTENT_MISMATCH");
      return { ...existing, retrievedAt: (await stat(path)).mtime.toISOString() };
    }
    catch { /* Only valid, complete envelopes count as a resumable capture. */ }
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await capture(args, path);
        const temp = `${metadataPath}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temp, JSON.stringify({ fingerprint, sha256: response.sha256 }), { mode: 0o600 });
        await rename(temp, metadataPath);
        return { ...response, retrievedAt: (await stat(path)).mtime.toISOString() };
      } catch (error) {
        const code = safeCode(error);
        if (attempt < 4 && retryable(code)) {
          options.onRetry();
          await sleep(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
          continue;
        }
        options.onFailure({ code, endpoint, target });
        return null;
      }
    }
    return null;
  };
}
