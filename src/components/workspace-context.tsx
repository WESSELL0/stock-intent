"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { METRICS, type MetricId } from "@/domain/metrics";
import { detectConflicts } from "@/domain/conflicts";
import { INITIAL_PRESETS } from "@/domain/presets";
import { NaturalLanguageIntentSchema, type Condition, type NaturalLanguageIntent } from "@/domain/schemas";
import { needsQueryClarification } from "@/domain/preset-intent";

export type SnapshotSummary = { ready: true; snapshot_id: string; universe: string; market_date: string; report_period: string;
  status: "ready" | "partial"; stock_count: number; built_at: string; coverage: Record<MetricId, number>; issues: string[] };
export type EvidenceView = { value: number | null; unit: "percent" | "multiple"; source: string; endpoint: string;
  as_of: string | null; as_of_semantics: string; retrieved_at: string; report_period: string | null;
  calculation_method: string; quality: string; issues: string[]; raw_fields: string[];
  observation_count: number | null; window_start: string | null; window_end: string | null };
export type ResultView = { stock: { thscode: string; ticker: string; name: string }; status: "PASS" | "FAIL" | "UNKNOWN";
  failed_condition_count: number; unknown_condition_count: number;
  metrics: Record<MetricId, { value: number | null; quality: string }>;
  condition_results: Array<{ condition: Condition; status: "PASS" | "FAIL" | "UNKNOWN";
    actual_value: number | null; reason: string; evidence: EvidenceView }> };
export type ScreenResponse = { snapshot: SnapshotSummary;
  run_id: string; baseline_conditions: Condition[]; applied_conditions: Condition[]; counts: { total: number; pass: number; fail: number; unknown: number }; results: ResultView[];
  near_miss_codes: string[]; sensitivity: { snapshot_id: string; before_count: number; after_count: number;
    newly_included: string[]; newly_excluded: string[]; unknown_before_count: number; unknown_after_count: number } | null };
type Workspace = { query: string; setQuery: (value: string) => void; parsed: boolean; parsing: boolean; parseIntent: () => Promise<void>;
  intent: NaturalLanguageIntent | null; interpreter: "preset" | "llm" | null; clarificationRequired: boolean;
  conditions: Condition[]; setConditions: (conditions: Condition[]) => void; addCondition: (metric: MetricId) => void;
  snapshot: SnapshotSummary | null; snapshotError: string | null; result: ScreenResponse | null;
  running: boolean; error: string | null; run: () => Promise<boolean>; conflicts: ReturnType<typeof detectConflicts> };

const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [query, updateQuery] = useState("");
  const generation = useRef(0);
  const [intent, setIntent] = useState<NaturalLanguageIntent | null>(null);
  const [interpreter, setInterpreter] = useState<"preset" | "llm" | null>(null);
  const [baseline, setBaseline] = useState<Condition[]>(INITIAL_PRESETS);
  const [parsed, setParsed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [conditions, setConditions] = useState<Condition[]>(INITIAL_PRESETS);
  const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/snapshot", { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (active) { if (response.ok && payload.ready) setSnapshot(payload as SnapshotSummary);
        else setSnapshotError(payload.message || "真实快照不可用"); }
    }).catch(() => { if (active) setSnapshotError("快照状态读取失败"); });
    return () => { active = false; };
  }, []);
  const conflicts = useMemo(() => detectConflicts(conditions), [conditions]);
  const clarificationRequired = intent ? needsQueryClarification(intent) : true;
  const setQuery = useCallback((value: string) => {
    generation.current += 1;
    updateQuery(value); setParsed(false); setIntent(null); setInterpreter(null); setResult(null); setError(null);
  }, []);
  const parseIntent = useCallback(async () => {
    const attempt = ++generation.current;
    setParsing(true); setParsed(false); setIntent(null); setResult(null); setError(null);
    try {
      const response = await fetch("/api/intent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_query: query.trim() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "意图解析失败");
      const next = NaturalLanguageIntentSchema.parse(payload.intent);
      if (next.original_query !== query.trim() || !["preset", "llm"].includes(payload.interpreter)) throw new Error("意图响应不一致");
      if (attempt !== generation.current) return;
      setIntent(next); setInterpreter(payload.interpreter); setConditions(next.conditions);
      setBaseline(next.conditions); setParsed(true);
    } catch (reason) {
      if (attempt === generation.current) { setParsed(false); setError(reason instanceof Error ? reason.message : "意图解析失败"); }
    } finally { setParsing(false); }
  }, [query]);
  const addCondition = useCallback((metric: MetricId) => {
    const item = METRICS[metric];
    setConditions(current => [...current, { id: `custom-${crypto.randomUUID()}`, source_phrase: "用户新增条件",
      category: item.category, metric, metric_label: item.label, operator: ">=", threshold: 0, unit: item.unit,
      explanation: "用户自行添加的白名单指标条件。", editable: true, origin: "user" }]);
  }, []);
  const run = useCallback(async () => {
    if (!parsed || clarificationRequired || parsing || !conditions.length || conflicts.length) { setError("请先解析描述并消除条件冲突"); return false; }
    const attempt = generation.current;
    setRunning(true); setError(null);
    try {
      const response = await fetch("/api/screen", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_query: query, conditions, baseline_conditions: baseline }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "筛选失败");
      if (attempt !== generation.current) return false;
      setResult(payload as ScreenResponse); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "筛选失败"); return false; }
    finally { setRunning(false); }
  }, [parsed, clarificationRequired, parsing, conditions, conflicts, query, baseline]);
  const value: Workspace = { intent, interpreter, clarificationRequired, query, setQuery, parsed, parsing, parseIntent, conditions, setConditions, addCondition,
    snapshot, snapshotError, result, running, error, run, conflicts };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace(): Workspace {
  const context = useContext(Context);
  if (!context) throw new Error("WORKSPACE_CONTEXT_MISSING");
  return context;
}
