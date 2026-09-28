import { readFile } from "node:fs/promises";
import {
  simulateTown,
  type SimulationModules,
  type SimulationOutcomes,
  type SimulationParameters,
} from "../lib/simulation.ts";

type ReferenceFile = {
  seed: string;
  outcomes: SimulationOutcomes[];
  parameters: SimulationParameters;
  modules: SimulationModules;
};

const path = new URL("../data/reference/base-1000-worlds.json", import.meta.url);
const reference = JSON.parse(await readFile(path, "utf8")) as ReferenceFile;

const mismatches: number[] = [];
for (let index = 0; index < reference.outcomes.length; index += 1) {
  const seed = `${reference.seed}-${String(index + 1).padStart(5, "0")}`;
  const outcome = simulateTown(seed, {
    collectHistory: false,
    parameters: reference.parameters,
    modules: reference.modules,
  }).outcomes;
  if (JSON.stringify(outcome) !== JSON.stringify(reference.outcomes[index])) mismatches.push(index + 1);
}

if (mismatches.length > 0) {
  throw new Error(`Reference data mismatch in runs: ${mismatches.slice(0, 20).join(", ")}`);
}

console.log(`Verified ${reference.outcomes.length} deterministic worlds.`);
