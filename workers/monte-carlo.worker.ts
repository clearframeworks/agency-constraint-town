/// <reference lib="webworker" />

import {
  MODEL_VERSION,
  POPULATION,
  simulateTown,
  type SimulationOutcomes,
  type SimulationModules,
  type SimulationParameters,
} from "@/lib/simulation";

type RunRequest = {
  type: "run";
  seed: string;
  runs: number;
  parameters: SimulationParameters;
  modules: SimulationModules;
};

export type MetricSummary = {
  mean: number;
  median: number;
  standardDeviation: number;
  confidenceLow: number;
  confidenceHigh: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  histogram: Array<{ from: number; to: number; count: number }>;
};

export type LaboratoryResult = {
  modelVersion: string;
  seed: string;
  runs: number;
  lives: number;
  runtimeMs: number;
  parameters: SimulationParameters;
  modules: SimulationModules;
  summaries: Record<keyof SimulationOutcomes, MetricSummary>;
  outcomes: SimulationOutcomes[];
};

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarize(values: number[]): MetricSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const margin = 1.96 * (standardDeviation / Math.sqrt(values.length));
  const histogram = Array.from({ length: 20 }, (_, index) => {
    const from = index * 5;
    const to = from + 5;
    const count = values.filter((value) => value >= from && (index === 19 ? value <= to : value < to)).length;
    return { from, to, count };
  });

  return {
    mean,
    median: percentile(sorted, 0.5),
    standardDeviation,
    confidenceLow: Math.max(0, mean - margin),
    confidenceHigh: Math.min(100, mean + margin),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    histogram,
  };
}

workerScope.onmessage = async (event: MessageEvent<RunRequest>) => {
  if (event.data.type !== "run") return;
  const { seed, runs, parameters, modules } = event.data;
  const started = performance.now();
  const outcomes: SimulationOutcomes[] = [];
  const batchSize = 20;

  for (let index = 0; index < runs; index += 1) {
    outcomes.push(
      simulateTown(`${seed}-${String(index + 1).padStart(5, "0")}`, {
        collectHistory: false,
        parameters,
        modules,
      }).outcomes,
    );

    if ((index + 1) % batchSize === 0 || index === runs - 1) {
      workerScope.postMessage({ type: "progress", completed: index + 1, runs });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const keys: Array<keyof SimulationOutcomes> = [
    "finalStablePct",
    "everAnyFailurePct",
    "everCompoundFailurePct",
    "chronicFailurePct",
    "everDisplacedPct",
  ];
  const summaries = Object.fromEntries(
    keys.map((key) => [key, summarize(outcomes.map((outcome) => outcome[key]))]),
  ) as Record<keyof SimulationOutcomes, MetricSummary>;

  const result: LaboratoryResult = {
    modelVersion: MODEL_VERSION,
    seed,
    runs,
    lives: runs * POPULATION,
    runtimeMs: performance.now() - started,
    parameters,
    modules,
    summaries,
    outcomes,
  };
  workerScope.postMessage({ type: "complete", result });
};

export {};
