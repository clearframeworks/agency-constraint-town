import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BASE_MODULES,
  DEFAULT_PARAMETERS,
  LAYERED_MODULES,
  MODEL_VERSION,
  POPULATION,
  simulateTown,
  type SimulationModules,
  type SimulationOutcomes,
} from "../lib/simulation.ts";

type MetricSummary = {
  mean: number;
  median: number;
  standardDeviation: number;
  confidenceLow: number;
  confidenceHigh: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
};

const metricKeys: Array<keyof SimulationOutcomes> = [
  "finalStablePct",
  "everAnyFailurePct",
  "everCompoundFailurePct",
  "chronicFailurePct",
  "everDisplacedPct",
];

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function percentile(sorted: number[], probability: number) {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
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
  };
}

const seed = argument("seed", "agency-lab-0001");
const runs = Number(argument("runs", "1000"));
const mode = argument("mode", "base");
const outputStem = resolve(argument("out", `data/reference/${mode}-${runs}-worlds`));

if (!Number.isInteger(runs) || runs < 1 || runs > 100_000) {
  throw new Error("--runs must be an integer between 1 and 100000");
}

if (mode !== "base" && mode !== "layered") {
  throw new Error("--mode must be either base or layered");
}

const modules: SimulationModules = mode === "layered" ? LAYERED_MODULES : BASE_MODULES;
const started = performance.now();
const outcomes: SimulationOutcomes[] = [];

for (let index = 0; index < runs; index += 1) {
  outcomes.push(
    simulateTown(`${seed}-${String(index + 1).padStart(5, "0")}`, {
      collectHistory: false,
      parameters: DEFAULT_PARAMETERS,
      modules,
    }).outcomes,
  );
}

const summaries = Object.fromEntries(
  metricKeys.map((key) => [key, summarize(outcomes.map((outcome) => outcome[key]))]),
) as Record<keyof SimulationOutcomes, MetricSummary>;

const result = {
  schemaVersion: 1,
  modelVersion: MODEL_VERSION,
  generatedAt: new Date().toISOString(),
  seed,
  runs,
  lives: runs * POPULATION,
  daysPerWorld: 364,
  mode,
  parameters: DEFAULT_PARAMETERS,
  modules,
  summaries,
  outcomes,
};

const csvHeader = ["run", "seed", ...metricKeys].join(",");
const csvRows = outcomes.map((outcome, index) => [
  index + 1,
  `${seed}-${String(index + 1).padStart(5, "0")}`,
  ...metricKeys.map((key) => outcome[key]),
].join(","));

await mkdir(dirname(outputStem), { recursive: true });
await Promise.all([
  writeFile(`${outputStem}.json`, `${JSON.stringify(result, null, 2)}\n`, "utf8"),
  writeFile(`${outputStem}.csv`, `${[csvHeader, ...csvRows].join("\n")}\n`, "utf8"),
]);

console.log(JSON.stringify({
  files: [`${outputStem}.json`, `${outputStem}.csv`],
  runtimeMs: Math.round(performance.now() - started),
  summaries,
}, null, 2));
