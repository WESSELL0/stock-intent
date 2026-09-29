// Node-only maintenance adapter. Never import into a React client component.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const Envelope = z.object({ ok: z.literal(true), data: z.unknown(), meta: z.object({ truncated: z.boolean().optional() }).passthrough().optional() });

export async function financeEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env };
  if (env.HITHINK_FINANCE_API_KEY) return env;
  const configDirectory = process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? (env.APPDATA ?? "") : (env.XDG_CONFIG_HOME ?? join(homedir(), ".config"));
  const credentialPath = env.HITHINK_CREDENTIALS_FILE || join(configDirectory, "hithink-finance", "credentials.env");
  try {
    const contents = await readFile(credentialPath, "utf8");
    const entries = new Map(contents.split(/\r?\n/).flatMap(line => {
      const match = line.match(/^\s*(?:export\s+)?(HITHINK_FINANCE_API_KEY|FUYAO_TOKEN|API_KEY)\s*=\s*(.*?)\s*$/);
      if (!match) return [];
      const value = match[2]!.replace(/^(["'])(.*)\1$/, "$2");
      return value ? [[match[1]!, value] as const] : [];
    }));
    const key = entries.get("HITHINK_FINANCE_API_KEY") || entries.get("FUYAO_TOKEN") || entries.get("API_KEY");
    if (key) env.HITHINK_FINANCE_API_KEY = key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("CREDENTIAL_FILE_UNREADABLE");
  }
  env.HITHINK_FINANCE_API_KEY ||= env.FUYAO_TOKEN || env.API_KEY;
  // If absent, CLI may use its system credential store. Never print env or key.
  return env;
}

export type CapturedResponse = { data: unknown; sha256: string; relative_path: string };

export async function readCapture(relativePath: string): Promise<CapturedResponse> {
  const contents = await readFile(relativePath, "utf8");
  const envelope = Envelope.parse(JSON.parse(contents));
  if (envelope.meta?.truncated) throw new Error("TRUNCATED_RESPONSE");
  return { data: envelope.data, sha256: createHash("sha256").update(contents).digest("hex"), relative_path: relativePath };
}

export async function captureFinance(args: string[], relativePath: string): Promise<CapturedResponse> {
  const env = await financeEnvironment();
  await mkdir(dirname(relativePath), { recursive: true, mode: 0o700 });
  try {
    const { stdout } = await execute("hithink-finance", [...args, "--format", "json", "--output", relativePath], {
      env, timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    });
    Envelope.parse(JSON.parse(stdout));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    // Only emit an allowlisted error code, never a raw subprocess command or env.
    let code = (error as { killed?: boolean }).killed ? "CLI_CHILD_TIMEOUT" : "CLI_EXECUTION_FAILED";
    try {
      const parsed = z.object({ error: z.object({ code: z.union([z.string().regex(/^[A-Z0-9_]{1,100}$/), z.number().int().nonnegative()]) }) }).parse(JSON.parse(stderr));
      code = String(parsed.error.code);
    } catch { /* Keep safe fallback. */ }
    throw new Error(code);
  }
  await chmod(relativePath, 0o600);
  return readCapture(relativePath);
}
