"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FlaskConical,
  Home,
  Pause,
  Play,
  RotateCcw,
  Sigma,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_MODULES,
  DEFAULT_PARAMETERS,
  LAYERED_MODULES,
  MODEL_VERSION,
  POPULATION,
  type SimulationOutcomes,
  type SimulationModules,
  type SimulationParameters,
} from "@/lib/simulation";
import type { LaboratoryResult, MetricSummary } from "@/workers/monte-carlo.worker";

type WorkerMessage =
  | { type: "progress"; completed: number; runs: number }
  | { type: "complete"; result: LaboratoryResult };

const METRICS: Array<{
  key: keyof SimulationOutcomes;
  label: string;
  shortLabel: string;
  definition: string;
  reference: string;
  tone: string;
}> = [
  {
    key: "finalStablePct",
    label: "Stable at year end",
    shortLabel: "Year-end stable",
    definition: "Food, housing, and safety are all above the failure threshold on the final day.",
    reference: "Essay reference: roughly 90%",
    tone: "green",
  },
  {
    key: "everAnyFailurePct",
    label: "Any basic need failed",
    shortLabel: "Experienced hardship",
    definition: "Food, housing, or safety crosses its failure threshold on at least one day during the year.",
    reference: "Broader path measure derived from the essay's three needs",
    tone: "sand",
  },
  {
    key: "everCompoundFailurePct",
    label: "Ever in compound failure",
    shortLabel: "Lived failure",
    definition: "Two or more basic needs fail simultaneously on at least one day during the year.",
    reference: "Essay reference: nearly half",
    tone: "amber",
  },
  {
    key: "chronicFailurePct",
    label: "Trapped most of the year",
    shortLabel: "Chronic failure",
    definition: "Compound failure persists for more than half of the simulated year.",
    reference: "Essay reference: about 1 in 24",
    tone: "red",
  },
  {
    key: "everDisplacedPct",
    label: "Ever displaced",
    shortLabel: "Houseless / displaced",
    definition: "Housing security crosses the displacement threshold at any point in the year.",
    reference: "Mechanism output—not an essay target",
    tone: "slate",
  },
];

const round = (value: number, places = 1) => value.toFixed(places);

function ParameterControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-control">
      <span>{label}<strong>{suffix === "$" ? `$${value}` : `${value}${suffix}`}</strong></span>
      <input aria-label={label} aria-valuetext={suffix === "$" ? `$${value}` : `${value}${suffix}`} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <small>{min}{suffix}<i />{max}{suffix}</small>
    </label>
  );
}

function Histogram({ summary, tone, label }: { summary: MetricSummary; tone: string; label: string }) {
  const maxCount = Math.max(1, ...summary.histogram.map((bin) => bin.count));
  return (
    <div className={`distribution distribution--${tone}`}>
      <div className="distribution-heading">
        <div><span>{label}</span><strong>{round(summary.mean)}%</strong><small>mean across worlds</small></div>
        <div className="interval"><span>95% CI of mean</span><b>{round(summary.confidenceLow)}–{round(summary.confidenceHigh)}%</b></div>
      </div>
      <div className="histogram" aria-label={`${label} distribution histogram`}>
        {summary.histogram.map((bin) => (
          <i
            key={bin.from}
            title={`${bin.from}–${bin.to}%: ${bin.count} worlds`}
            style={{ height: `${Math.max(2, (bin.count / maxCount) * 100)}%` }}
          />
        ))}
      </div>
      <div className="histogram-axis"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      <div className="distribution-stats">
        <span>p10 <b>{round(summary.p10)}%</b></span>
        <span>median <b>{round(summary.median)}%</b></span>
        <span>p90 <b>{round(summary.p90)}%</b></span>
        <span>SD <b>{round(summary.standardDeviation)} pts</b></span>
      </div>
    </div>
  );
}

function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Laboratory() {
  const workerRef = useRef<Worker | null>(null);
  const [seed, setSeed] = useState("agency-lab-0001");
  const [runs, setRuns] = useState(1000);
  const [parameters, setParameters] = useState<SimulationParameters>(DEFAULT_PARAMETERS);
  const [modules, setModules] = useState<SimulationModules>(BASE_MODULES);
  const [completed, setCompleted] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LaboratoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createWorker = useCallback(() => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/monte-carlo.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "progress") {
        setCompleted(event.data.completed);
      } else {
        setResult(event.data.result);
        setCompleted(event.data.result.runs);
        setRunning(false);
      }
    };
    worker.onerror = () => { setRunning(false); setError("The experiment stopped before it finished. Try fewer worlds and run it again."); worker.terminate(); workerRef.current = null; };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    createWorker();
    return () => workerRef.current?.terminate();
  }, [createWorker]);

  const updateParameter = useCallback((key: keyof SimulationParameters, value: number) => {
    setParameters((current) => ({ ...current, [key]: value }));
  }, []);

  const runExperiment = useCallback(() => {
    const worker = workerRef.current ?? createWorker();
    setCompleted(0);
    setError(null);
    setResult(null);
    setRunning(true);
    worker.postMessage({ type: "run", seed, runs, parameters, modules });
  }, [createWorker, modules, parameters, runs, seed]);

  const cancelExperiment = useCallback(() => {
    createWorker();
    setRunning(false);
  }, [createWorker]);

  const exportJson = useCallback(() => {
    if (!result) return;
    downloadFile(`agency-${result.seed}-${result.runs}-worlds.json`, JSON.stringify(result, null, 2), "application/json");
  }, [result]);

  const exportCsv = useCallback(() => {
    if (!result) return;
    const header = "run,final_stable_pct,ever_any_failure_pct,ever_compound_failure_pct,chronic_failure_pct,ever_displaced_pct";
    const rows = result.outcomes.map((outcome, index) => [
      index + 1,
      outcome.finalStablePct,
      outcome.everAnyFailurePct,
      outcome.everCompoundFailurePct,
      outcome.chronicFailurePct,
      outcome.everDisplacedPct,
    ].join(","));
    downloadFile(`agency-${result.seed}-${result.runs}-worlds.csv`, [header, ...rows].join("\n"), "text/csv");
  }, [result]);

  const progress = runs > 0 ? (completed / runs) * 100 : 0;
  const settingsChanged = result && (result.seed !== seed || result.runs !== runs || JSON.stringify(result.parameters) !== JSON.stringify(parameters) || JSON.stringify(result.modules) !== JSON.stringify(modules));
  const reproducibilityCode = useMemo(
    () => `${MODEL_VERSION} / ${seed} / ${runs}×${POPULATION} / ${Object.values(modules).map(Number).join("")}`,
    [modules, runs, seed],
  );

  return (
    <main className="lab-shell">
      <header className="lab-nav">
        <Link href="/"><ArrowLeft size={15} /> Return to the town</Link>
        <span><FlaskConical size={15} /> Agency Laboratory</span>
        <code>model {MODEL_VERSION}</code>
      </header>

      <section className="lab-hero">
        <span className="eyebrow"><Sigma size={14} /> Reproducible Monte Carlo experiment</span>
        <h1>One town tells a story.<br /><em>1,000 towns reveal the distribution.</em></h1>
        <p>
          Start with a fair control world: equal effort, starting wealth, actions, and opportunity. Then switch on transportation, health, access, and education constraints one at a time—or all together—and compare the resulting distributions.
        </p>
        <div className="lab-facts">
          <span><b>{runs.toLocaleString()}</b> independent worlds</span>
          <span><b>{(runs * POPULATION).toLocaleString()}</b> simulated lives</span>
          <span><b>364</b> daily transitions</span>
          <span><b>100%</b> effort, locked</span>
        </div>
      </section>

      <section className="experiment-layout">
        <aside className="experiment-controls">
          <div className="section-kicker">01 / Experimental setup</div>
          <label className="text-control"><span>Base seed</span><input value={seed} onChange={(event) => setSeed(event.target.value)} disabled={running} /></label>
          <label className="text-control"><span>Independent worlds</span>
            <select value={runs} onChange={(event) => setRuns(Number(event.target.value))} disabled={running}>
              <option value={100}>100 — diagnostic</option>
              <option value={500}>500 — exploratory</option>
              <option value={1000}>1,000 — standard</option>
              <option value={2500}>2,500 — high precision</option>
            </select>
          </label>

          <div className="module-controls">
            <div className="module-heading"><span>Structural layers</span><div><button onClick={() => setModules(BASE_MODULES)} disabled={running}>Base</button><button onClick={() => setModules(LAYERED_MODULES)} disabled={running}>All</button></div></div>
            {(Object.keys(modules) as Array<keyof SimulationModules>).map((key) => (
              <label key={key} className="module-toggle">
                <span><b>{key}</b><small>{key === "transportation" ? "distance, cost, route reliability" : key === "health" ? "higher incidence, cost, slower recovery" : key === "access" ? "benefit delay and recovery friction" : "wage and re-entry opportunity"}</small></span>
                <input type="checkbox" checked={modules[key]} onChange={(event) => setModules((current) => ({ ...current, [key]: event.target.checked }))} disabled={running} />
                <i />
              </label>
            ))}
          </div>

          <fieldset className="parameter-fields" disabled={running} aria-label="Model assumptions">
          <ParameterControl label="Starting cash" value={parameters.startingCash} min={0} max={3000} step={50} suffix="$" onChange={(value) => updateParameter("startingCash", value)} />
          <ParameterControl label="Monthly rent" value={parameters.monthlyRent} min={600} max={1600} step={20} suffix="$" onChange={(value) => updateParameter("monthlyRent", value)} />
          <ParameterControl label="Shock frequency" value={parameters.shockFrequency} min={0.5} max={2} step={0.05} suffix="×" onChange={(value) => updateParameter("shockFrequency", value)} />
          <ParameterControl label="Blocked recovery after displacement" value={Math.round(parameters.recoveryBarrierChance * 100)} min={0} max={100} step={5} suffix="%" onChange={(value) => updateParameter("recoveryBarrierChance", value / 100)} />

          </fieldset>
          <div className="locked-variables">
            <span>Held constant</span>
            <b>${parameters.hourlyWage}/hr wage</b>
            <b>{parameters.weeklyHours} hours/week</b>
            <b>{POPULATION} residents/world</b>
            <b>{parameters.maxJobLosses} maximum job-loss events</b>
          </div>

          <button className="lab-run-button" onClick={running ? cancelExperiment : runExperiment}>
            {running ? <><Pause size={17} /> Stop experiment</> : <><Play size={17} /> Run {runs.toLocaleString()} worlds</>}
          </button>
          <button className="reset-button" onClick={() => { setParameters(DEFAULT_PARAMETERS); setModules(BASE_MODULES); }} disabled={running}><RotateCcw size={14} /> Restore canonical control</button>

          <div className="repro-code"><span>Reproduction key</span><code>{reproducibilityCode}</code></div>
        </aside>

        <div className="experiment-output">
          <div className="section-kicker">02 / Results</div>
          {error && <p className="lab-notice" role="alert">{error}</p>}
          {settingsChanged && <p className="lab-notice" role="status">These results use the previous settings. Run the experiment again to test your new assumptions. Downloads retain the settings used for the completed run.</p>}
          {running ? (
            <div className="running-state">
              <span className="lab-spinner" />
              <h2>Simulating world {completed.toLocaleString()} of {runs.toLocaleString()}</h2>
              <p>The computation is running off the interface thread. You can keep reading while it completes.</p>
              <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
              <strong>{round(progress, 0)}%</strong>
            </div>
          ) : result ? (
            <>
              <div className="result-banner">
                <CheckCircle2 size={18} />
                <span><b>Experiment complete</b>{result.runs.toLocaleString()} worlds · {result.lives.toLocaleString()} lives · {(result.runtimeMs / 1000).toFixed(1)} seconds</span>
                <div><button onClick={exportCsv}><Download size={14} /> CSV</button><button onClick={exportJson}><Download size={14} /> JSON</button></div>
              </div>
              <div className="headline-results">
                {METRICS.map((metric) => {
                  const summary = result.summaries[metric.key];
                  return (
                    <article key={metric.key} className={`headline-result headline-result--${metric.tone}`}>
                      <span>{metric.shortLabel}</span>
                      <strong>{round(summary.mean)}%</strong>
                      <small>world mean · p10–p90 {round(summary.p10)}–{round(summary.p90)}%</small>
                    </article>
                  );
                })}
              </div>
              <div className="distributions">
                {METRICS.map((metric) => <Histogram key={metric.key} summary={result.summaries[metric.key]} tone={metric.tone} label={metric.label} />)}
              </div>
            </>
          ) : (
            <div className="empty-results">
              <FlaskConical size={34} />
              <h2>The result does not exist until you run it.</h2>
              <p>Choose a reproducible seed and parameter set, then generate the full distribution. No headline value is prefilled.</p>
            </div>
          )}
        </div>
      </section>

      <section className="methods-section">
        <div className="section-kicker">03 / Operational definitions</div>
        <h2>Every number must say what it measures.</h2>
        <div className="definition-grid">
          {METRICS.map((metric, index) => (
            <article key={metric.key}>
              <span>0{index + 1}</span><h3>{metric.label}</h3><p>{metric.definition}</p><small>{metric.reference}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="methods-section model-limits">
        <div>
          <div className="section-kicker">04 / Scientific boundary</div>
          <h2>This estimates the model—not the country.</h2>
        </div>
        <div className="limits-copy">
          <p><TriangleAlert size={16} /> Monte Carlo repetition measures uncertainty produced by these rules. It does not make the assumptions empirically true.</p>
          <ul>
            <li>Residents are synthetic agents, not survey respondents.</li>
            <li>The 95% intervals describe uncertainty in the simulated world mean.</li>
            <li>The control is calibrated only to the essay's three published aggregates; it is not fitted to population data.</li>
            <li>Constraint layers are explicit model assumptions, not empirical causal estimates.</li>
            <li>Every parameter and seed is exported with the raw outcome table.</li>
          </ul>
        </div>
      </section>

      <footer className="lab-footer">
        <span><Home size={14} /> Agency · a mechanism made visible</span>
        <Link href="/">Enter the town</Link>
      </footer>
    </main>
  );
}
