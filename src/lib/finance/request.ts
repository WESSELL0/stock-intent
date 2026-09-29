import { stat } from "node:fs/promises";
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
  return async (path: string, args: string[], endpoint: string, target: string): Promise<Capture | null> => {
    try { const existing = await readCapture(path); return { ...existing, retrievedAt: (await stat(path)).mtime.toISOString() }; }
    catch { /* Only valid, complete envelopes count as a resumable capture. */ }
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await capture(args, path);
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
