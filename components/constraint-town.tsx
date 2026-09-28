"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  Dices,
  Gauge,
  Home,
  Info,
  LocateFixed,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HouseholdJourney } from "@/components/household-journey";
import { TownCanvas, type ViewCommand } from "@/components/town-world";
import {
  BASE_MODULES,
  DAYS_IN_YEAR,
  formatDay,
  getAgentStatus,
  LAYERED_MODULES,
  simulateTown,
  type AgentSnapshot,
  type TownMetrics,
} from "@/lib/simulation";

const PLAYBACK = [
  { days: 1, label: "1 day/s" },
  { days: 7, label: "1 week/s" },
  { days: 30, label: "1 month/s" },
  { days: 90, label: "1 quarter/s" },
];

const LAB_REFERENCE = [
  { label: "Stable at year end", expected: "about 90%", observed: 89.72, interval: "89.55–89.88", tone: "green" },
  { label: "Ever in compound failure", expected: "nearly 50%", observed: 49.8, interval: "49.52–50.07", tone: "red" },
  { label: "Chronically failing", expected: "1 in 24 · 4.17%", observed: 4.38, interval: "4.27–4.50", tone: "amber" },
  { label: "Experienced any hardship", expected: "model output", observed: 52.88, interval: "52.61–53.16", tone: "sand" },
  { label: "Ever displaced", expected: "model output", observed: 8.69, interval: "8.54–8.84", tone: "slate" },
] as const;

const money = (value: number) => `$${Math.round(value).toLocaleString()}`;

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TownEvidenceChart({ data, currentDay }: { data: TownMetrics[]; currentDay: number }) {
  const width = 900;
  const height = 250;
  const plot = { left: 42, right: 16, top: 16, bottom: 28 };
  const innerWidth = width - plot.left - plot.right;
  const innerHeight = height - plot.top - plot.bottom;
  const x = (index: number) => plot.left + (index / DAYS_IN_YEAR) * innerWidth;
  const y = (value: number) => plot.top + innerHeight - (value / 100) * innerHeight;
  const points = (key: keyof Pick<TownMetrics, "stablePct" | "compoundFailurePct" | "displacedPct">) =>
    data.map((item, index) => `${x(index)},${y(item[key])}`).join(" ");

  return (
    <svg className="evidence-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Town state across the simulated year">
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1={plot.left} y1={y(tick)} x2={width - plot.right} y2={y(tick)} className="evidence-grid" />
          <text x={plot.left - 8} y={y(tick) + 3} textAnchor="end">{tick}%</text>
        </g>
      ))}
      {[0, 91, 182, 273, 364].map((tick) => (
        <text key={tick} x={x(tick)} y={height - 7} textAnchor={tick === 0 ? "start" : tick === 364 ? "end" : "middle"}>day {tick}</text>
      ))}
      <polyline points={points("stablePct")} className="evidence-line evidence-line--stable" />
      <polyline points={points("compoundFailurePct")} className="evidence-line evidence-line--compound" />
      <polyline points={points("displacedPct")} className="evidence-line evidence-line--displaced" />
      <line x1={x(currentDay)} y1={plot.top} x2={x(currentDay)} y2={plot.top + innerHeight} className="evidence-cursor" />
      <circle cx={x(currentDay)} cy={y(data[currentDay].stablePct)} r="4" className="evidence-point evidence-point--stable" />
      <circle cx={x(currentDay)} cy={y(data[currentDay].compoundFailurePct)} r="4" className="evidence-point evidence-point--compound" />
      <circle cx={x(currentDay)} cy={y(data[currentDay].displacedPct)} r="4" className="evidence-point evidence-point--displaced" />
    </svg>
  );
}

function HouseholdTrace({ history, currentDay }: { history: AgentSnapshot[]; currentDay: number }) {
  const width = 900;
  const height = 178;
  const left = 34;
  const right = 12;
  const top = 12;
  const bottom = 24;
  const x = (index: number) => left + (index / DAYS_IN_YEAR) * (width - left - right);
  const y = (value: number) => top + (1 - value) * (height - top - bottom);
  const points = (key: "food" | "housing" | "safety" | "health") => history.map((agent, index) => `${x(index)},${y(agent[key])}`).join(" ");

  return (
    <svg className="household-trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Selected household need scores across the year">
      <line x1={left} y1={y(0.55)} x2={width - right} y2={y(0.55)} className="trace-threshold" />
      <text x={left + 5} y={y(0.55) - 6}>failure threshold · 55</text>
      {(["food", "housing", "safety", "health"] as const).map((key) => <polyline key={key} points={points(key)} className={`trace-line trace-line--${key}`} />)}
      <line x1={x(currentDay)} y1={top} x2={x(currentDay)} y2={height - bottom} className="evidence-cursor" />
      <text x={left} y={height - 6}>day 0</text>
      <text x={width - right} y={height - 6} textAnchor="end">day 364</text>
    </svg>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Household state legend">
      <span><i className="dot dot--stable" />Stable</span>
      <span><i className="dot dot--pressure" />Under pressure</span>
      <span><i className="dot dot--failure" />Multiple needs failing</span>
      <span><i className="dot dot--displaced" />Displaced</span>
    </div>
  );
}

export function ConstraintTown() {
  const [seed, setSeed] = useState("marrow-0023");
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const methodDialog = useRef<HTMLDialogElement>(null);
  const [householdFilter, setHouseholdFilter] = useState<"all" | "stable" | "pressure" | "failure" | "displaced">("all");
  const [householdSort, setHouseholdSort] = useState<"id" | "debt" | "cash" | "compound">("id");
  const [householdView, setHouseholdView] = useState<"one" | "all">("all");
  const singleHouseholdButton = useRef<HTMLButtonElement>(null);
  const [viewCommand, setViewCommand] = useState<ViewCommand>({ id: 0, action: "reset" });
  const [worldMode, setWorldMode] = useState<"base" | "layered">("base");
  const run = useMemo(
    () => simulateTown(seed, { modules: worldMode === "base" ? BASE_MODULES : LAYERED_MODULES }),
    [seed, worldMode],
  );
  const snapshot = run.snapshots[day];
  const lived = useMemo(() => {
    const hardship = new Set<number>();
    const compound = new Set<number>();
    for (const frame of run.snapshots.slice(0, day + 1)) {
      for (const agent of frame.agents) {
        const failures = [agent.food, agent.housing, agent.safety].filter(value => value < .55).length;
        if (failures > 0) hardship.add(agent.id);
        if (failures > 1) compound.add(agent.id);
      }
    }
    return { hardship: hardship.size, compound: compound.size };
  }, [run, day]);
  const selected = selectedId === null ? null : snapshot.agents[selectedId] ?? null;
  const focusedId = selectedId ?? 0;
  const focused = snapshot.agents[focusedId];
  const focusedHistory = useMemo(() => run.snapshots.map((item) => item.agents[focusedId]), [run, focusedId]);
  const townLedger = useMemo(() => {
    const debts = snapshot.agents.map((agent) => agent.debt);
    return {
      debtHouseholds: debts.filter((debt) => debt > 0).length,
      medianDebt: median(debts),
      maximumDebt: Math.max(...debts),
      cashOnHand: snapshot.agents.reduce((sum, agent) => sum + agent.cash, 0),
    };
  }, [snapshot]);
  const householdRows = useMemo(() => {
    const filtered = snapshot.agents.filter((agent) => {
      const status = getAgentStatus(agent);
      if (householdFilter === "stable") return status === "stable";
      if (householdFilter === "pressure") return status === "under pressure";
      if (householdFilter === "failure") return status === "compound failure";
      if (householdFilter === "displaced") return status === "displaced";
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (householdSort === "debt") return b.debt - a.debt;
      if (householdSort === "cash") return b.cash - a.cash;
      if (householdSort === "compound") return b.daysInCompoundFailure - a.daysInCompoundFailure;
      return a.id - b.id;
    });
  }, [snapshot, householdFilter, householdSort]);

  useEffect(() => {
    if (showAbout) methodDialog.current?.showModal();
    else methodDialog.current?.close();
  }, [showAbout]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDay((current) => {
        if (current >= DAYS_IN_YEAR) {
          setPlaying(false);
          return current;
        }
        return Math.min(DAYS_IN_YEAR, current + PLAYBACK[speedIndex].days);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, speedIndex]);

  const newWorld = useCallback(() => {
    const next = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    setSeed(`town-${next}`);
    setDay(0);
    setPlaying(false);
    setSelectedId(null);
  }, []);

  const changeView = useCallback((action: ViewCommand["action"]) => {
    setViewCommand((current) => ({ id: current.id + 1, action }));
  }, []);

  const togglePlayback = () => {
    if (day === DAYS_IN_YEAR) setDay(0);
    setPlaying(value => !value);
  };
  const goToDay = (nextDay: number) => { setDay(nextDay); setPlaying(false); };

  const events = snapshot.events;
  const selectedStatus = selected ? getAgentStatus(selected) : null;

  return (
    <main className="experience-shell">
      <a className="skip-link" href="#household-story">Skip the 3D town and explore a household</a>
      <header className="topbar">
        <a className="brand" href="https://eliasmarrow.org" target="_blank" rel="noreferrer">
          <span className="brand-mark">a.</span>
          <span><strong>Agency</strong><small>An inquiry by Elias Marrow</small></span>
        </a>
        <div className="run-state">
          <span className={`live-dot ${playing ? "is-running" : ""}`} />
          <span>{playing ? "World running" : day === DAYS_IN_YEAR ? "Year complete" : "World paused"}</span>
          <code>seed / {seed}</code>
        </div>
        <div className="top-actions">
          <button className="ghost-button" onClick={() => setShowAbout((value) => !value)}><Info size={15} /> Method</button>
          <Link className="ghost-button lab-link" href="/laboratory"><Dices size={16} /> Enter the laboratory</Link>
        </div>
      </header>

      <section className="hero-copy">
        <span className="eyebrow"><Activity size={13} /> An experiment in perspective</span>
        <h1>Effort was<br /><em>held constant.</em></h1>
        <p>
          {worldMode === "base"
            ? "Same starting resources. Same effort. Same opportunities. A different sequence of setbacks. Follow what happens to 120 households over a year."
            : "Starting effort stays equal while transportation, health, access, and education limits reshape the available paths."}
        </p>
        <div className="world-mode" aria-label="Simulation complexity">
          <button aria-pressed={worldMode === "base"} className={worldMode === "base" ? "is-active" : ""} onClick={() => { setWorldMode("base"); setPlaying(false); }}>Equal starting ground</button>
          <button aria-pressed={worldMode === "layered"} className={worldMode === "layered" ? "is-active" : ""} onClick={() => { setWorldMode("layered"); setPlaying(false); }}>Add constraints</button>
          <span>{worldMode === "base" ? "Only the seeded daily roll differs" : "Transport · health · access · education"}</span>
        </div>
        <Legend />
        <div className="hero-actions">
          <button className="primary-button" onClick={togglePlayback}>
            {playing ? <><Pause size={16} /> Pause the year</> : <><Play size={16} /> {day === 0 ? "Begin the year" : day === DAYS_IN_YEAR ? "Replay the year" : "Continue the year"}</>}
          </button>
          <button className="ghost-button" onClick={newWorld}><RotateCcw size={15} /> New town</button>
        </div>
        <a className="story-link" href="#household-story" onClick={() => setPlaying(false)}>Follow one household <ArrowRight size={16} /></a>
        <a className="story-link" href="#household-ledger" onClick={() => { setPlaying(false); setHouseholdView("all"); setHouseholdFilter("all"); }}>See all households <ArrowRight size={16} /></a>
        <p className="model-boundary">An explanatory simulation. Its assumptions are inspectable; its outcomes are not estimates of real populations.</p>
      </section>

      <div className="world-stage">
        <div className="world-layer" aria-hidden="true">
          <TownCanvas
            agents={snapshot.agents}
            day={day}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id < 0 ? null : id)}
            viewCommand={viewCommand}
          />
        </div>
        <div className="vignette" />
        <div className="grain" />
        <div className="town-caption"><span>THE CONSTRAINT TOWN</span><strong>120 households. One year.</strong></div>
        <nav className="map-controls" aria-label="Map controls">
          <button onClick={() => changeView("zoom-in")} aria-label="Zoom map in"><Plus size={18} /></button>
          <button onClick={() => changeView("zoom-out")} aria-label="Zoom map out"><Minus size={18} /></button>
          <button onClick={() => changeView("overhead")} aria-label="Show whole town from above"><LocateFixed size={18} /></button>
          <span>drag · pinch · zoom</span>
        </nav>
      <aside className={`inspector ${selected ? "is-open" : ""}`} aria-hidden={!selected}>
        {selected && (
          <>
            <button className="icon-button inspector-close" onClick={() => setSelectedId(null)} aria-label="Close household details"><X size={16} /></button>
            <span className="eyebrow"><Home size={13} /> Household {String(selected.id + 1).padStart(3, "0")}</span>
            <h2 className={`status status--${selectedStatus?.replace(" ", "-")}`}>{selectedStatus}</h2>
            <p className="route-note">District {selected.zone + 1} · {selected.commuteMinutes} min to work</p>
            <div className="need-bars">
              {(["food", "housing", "safety", "health"] as const).map((key) => (
                <div key={key}><span>{key}</span><i><b style={{ width: `${selected[key] * 100}%` }} /></i><strong>{Math.round(selected[key] * 100)}</strong></div>
              ))}
            </div>
            <div className="household-ledger">
              <div><span>Cash</span><strong>${Math.round(selected.cash).toLocaleString()}</strong></div>
              <div><span>Debt</span><strong>${Math.round(selected.debt).toLocaleString()}</strong></div>
              <div><span>Rent</span><strong>${selected.rent}/mo</strong></div>
              <div><span>Wage</span><strong>${selected.wage}/hr</strong></div>
            </div>
            {worldMode === "layered" && (
              <div className="constraint-chips" aria-label="Household constraints">
                {selected.transportationLimited ? <span>transport</span> : null}
                {selected.healthLimited ? <span>health</span> : null}
                {selected.accessLimited ? <span>access</span> : null}
                {selected.educationLimited ? <span>education</span> : null}
                {!selected.transportationLimited && !selected.healthLimited && !selected.accessLimited && !selected.educationLimited ? <span>no added limit</span> : null}
              </div>
            )}
            <p className="effort-lock"><span>EFFORT</span><b>100%</b><small>locked for every resident</small></p>
          </>
        )}
      </aside>

        <div className="town-instruction">Each light is a household. Select a home to look closer.</div>
      </div>

      <section className="timeline-panel">
        <button className="transport-button" disabled={day === 0} onClick={() => goToDay(Math.max(0, day - 1))} aria-label="Previous day"><ArrowLeft size={17} /></button>
        <button className="transport-button transport-button--play" onClick={togglePlayback} aria-label={playing ? "Pause" : day === DAYS_IN_YEAR ? "Replay" : "Play"}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button className="transport-button" disabled={day === DAYS_IN_YEAR} onClick={() => goToDay(Math.min(DAYS_IN_YEAR, day + 1))} aria-label="Next day"><ArrowRight size={17} /></button>
        <div className="timeline-track">
          <div className="timeline-labels"><span>Jan 1</span><strong>{formatDay(day)} · day {day}</strong><span>Dec 31</span></div>
          <input
            type="range"
            min="0"
            max={DAYS_IN_YEAR}
            value={day}
            onChange={(event) => { setDay(Number(event.target.value)); setPlaying(false); }}
            aria-label="Simulation day"
            aria-valuetext={`${formatDay(day)}, day ${day} of ${DAYS_IN_YEAR}`}
            style={{ "--progress": `${(day / DAYS_IN_YEAR) * 100}%` } as React.CSSProperties}
          />
        </div>
        <button className="speed-button" onClick={() => setSpeedIndex((value) => (value + 1) % PLAYBACK.length)}>
          <Clock3 size={14} /><strong>{PLAYBACK[speedIndex].label}</strong><ChevronDown size={13} />
        </button>
        <div className="chapter-jumps" aria-label="Jump through the year">{[{ day: 0, label: "Beginning" }, { day: 91, label: "Spring" }, { day: 182, label: "Summer" }, { day: 273, label: "Autumn" }, { day: 364, label: "Year’s end" }].map(chapter => <button key={chapter.day} aria-pressed={day === chapter.day} onClick={() => goToDay(chapter.day)}>{chapter.label}</button>)}</div>
      </section>

      <aside className="data-panel">
        <div className="panel-heading">
          <span><Gauge size={14} /> In the town today</span>
          <strong>{formatDay(day)} · Day {day}</strong>
        </div>
        <div className="metric-grid">
          <Metric label="Basic needs met" value={`${snapshot.metrics.stablePct}%`} tone="good" />
          <Metric label="Compound failure" value={`${snapshot.metrics.compoundFailurePct}%`} tone="bad" />
          <Metric label="Houseless / displaced" value={`${snapshot.metrics.displacedPct}%`} tone="bad" />
          <Metric label="Food insecure" value={`${snapshot.metrics.foodInsecurePct}%`} tone="warn" />
          <Metric label="Housing unstable" value={`${snapshot.metrics.housingUnstablePct}%`} tone="warn" />
        </div>
        <div className="secondary-metrics">
          <span><CircleDollarSign size={14} /><b>${snapshot.metrics.totalDebt.toLocaleString()}</b> survival debt</span>
          <span><Users size={14} /><b>{snapshot.metrics.employedPct}%</b> employed</span>
        </div>
      </aside>

      <section className="event-feed" aria-label="Events on the selected day">
        <div className="event-title"><span>What changed</span><strong>{formatDay(day)}</strong></div>
        {events.length === 0 ? (
          <p className="quiet-day">No recorded shock. Fixed costs still moved.</p>
        ) : (
          events.slice(0, 3).map((event) => (
            <button key={event.id} onClick={() => event.agentId !== null && setSelectedId(event.agentId)}>
              <i className={`event-mark event-mark--${event.kind}`} />
              <span><strong>{event.title}</strong><small>{event.detail}</small></span>
            </button>
          ))
        )}
      </section>

      <section className="perspective" aria-labelledby="perspective-title">
        <div className="perspective-question"><span className="section-kicker">A snapshot is not a life</span><h2 id="perspective-title">Recovery doesn’t erase<br /><em>what it took to get here.</em></h2><p>Move through the year. Compare who is stable today with who has experienced hardship along the way.</p></div>
        <div className="perspective-numbers">
          <div><span>Stable on {formatDay(day)}</span><strong>{snapshot.agents.filter(agent => agent.food >= .55 && agent.housing >= .55 && agent.safety >= .55).length}<small> / 120</small></strong><p>Households with food, housing and safety needs met today.</p></div>
          <div><span>Hardship by {formatDay(day)}</span><strong>{lived.hardship}<small> / 120</small></strong><p>Households with at least one of those needs unmet at any point so far.</p></div>
        </div>
        <p className="perspective-footnote">These groups can overlap. {lived.compound} households have had two or more core needs fail together by this day. All values come from this town’s simulated record.</p>
      </section>

      <section className="evidence-dashboard" aria-label="Live simulation evidence">
        <nav className="evidence-nav" aria-label="Explore the evidence"><span>Look closer</span><a href="#household-story">01 · One household</a><a href="#town-record">02 · The whole town</a><a href="#debt-mechanism">03 · The mechanism</a><a href="#model-evidence">04 · Question the model</a></nav>
        <HouseholdJourney run={run} day={day} focusedId={focusedId} onSelect={setSelectedId} onDayChange={goToDay} />
        <div className="evidence-intro">
          <div>
            <span className="eyebrow"><Database size={13} /> Live evidence record</span>
            <h2>The town is the interface.<br /><em>The ledger is the evidence.</em></h2>
          </div>
          <div className="evidence-intro-copy">
            <p>Every house in the town is one simulated household. The clock above controls every figure below: scrub to any day and the town totals, household ledger, and selected-household history resolve to that exact frame.</p>
            <div className="live-frame"><span className={`live-dot ${playing ? "is-running" : ""}`} /><b>{formatDay(day)} · day {day}</b><code>{worldMode} / {seed}</code></div>
          </div>
        </div>

        <section id="town-record" className="evidence-section town-record">
          <div className="evidence-heading">
            <div><span className="section-kicker">02 / Town record</span><h3>What is happening across the year</h3></div>
            <p>A line is a share of the 120 households, not a probability. The vertical marker is the day currently visible in the 3D town.</p>
          </div>
          <div className="chart-card">
            <div className="chart-card-head">
              <span><i className="legend-line legend-line--stable" />Basic needs met <b>{snapshot.metrics.stablePct}%</b></span>
              <span><i className="legend-line legend-line--compound" />Compound failure <b>{snapshot.metrics.compoundFailurePct}%</b></span>
              <span><i className="legend-line legend-line--displaced" />Displaced now <b>{snapshot.metrics.displacedPct}%</b></span>
            </div>
            <TownEvidenceChart data={run.series} currentDay={day} />
          </div>
          <div className="ledger-strip">
            <div><span>Total survival debt</span><strong>{money(snapshot.metrics.totalDebt)}</strong><small>owed by {townLedger.debtHouseholds} households</small></div>
            <div><span>Median cash</span><strong>{money(snapshot.metrics.medianCash)}</strong><small>{money(townLedger.cashOnHand)} across town</small></div>
            <div><span>Employment</span><strong>{snapshot.metrics.employedPct}%</strong><small>effort remains fixed at 100%</small></div>
            <div><span>Food insecure</span><strong>{snapshot.metrics.foodInsecurePct}%</strong><small>food score below 55</small></div>
            <div><span>Housing unstable</span><strong>{snapshot.metrics.housingUnstablePct}%</strong><small>housing score below 55</small></div>
          </div>
        </section>

        <section id="household-ledger" className="evidence-section household-record">
          <div className="evidence-heading">
            <div><span className="section-kicker">Household ledger</span><h3>{householdView === "all" ? "Every household, side by side." : `Household ${String(focused.id + 1).padStart(3, "0")} through the year`}</h3></div>
            <p>Select a house in the town or a row in the ledger. Need scores below 55 are counted as failed; two or more at once are compound failure.</p>
          </div>
          <div className="household-view-toggle" role="group" aria-label="Household view">
            <button ref={singleHouseholdButton} aria-pressed={householdView === "one"} aria-controls="single-household-view" onClick={() => setHouseholdView("one")}>One household</button>
            <button aria-pressed={householdView === "all"} aria-controls="all-households-view" onClick={() => setHouseholdView("all")}>All households <span>120</span></button>
          </div>
          <div id="single-household-view" hidden={householdView !== "one"}>
          <label className="ledger-household-picker">Choose a household
            <select value={focusedId} onChange={event => setSelectedId(Number(event.target.value))}>{snapshot.agents.map(agent => <option key={agent.id} value={agent.id}>Household {String(agent.id + 1).padStart(3, "0")}</option>)}</select>
          </label>
          <div className="household-focus">
            <div className="focus-summary">
              <span className={`focus-status status--${getAgentStatus(focused).replace(" ", "-")}`}>{getAgentStatus(focused)}</span>
              <strong>{money(focused.cash)} cash</strong>
              <strong>{money(focused.debt)} debt</strong>
              <small>District {focused.zone + 1} · {focused.employed ? "employed" : "not employed"} · {focused.commuteMinutes} min commute</small>
            </div>
            <div className="trace-wrap">
              <div className="trace-legend"><span className="food">food {Math.round(focused.food * 100)}</span><span className="housing">housing {Math.round(focused.housing * 100)}</span><span className="safety">safety {Math.round(focused.safety * 100)}</span><span className="health">health {Math.round(focused.health * 100)}</span></div>
              <HouseholdTrace history={focusedHistory} currentDay={day} />
            </div>
          </div>

          </div>
          <div id="all-households-view" hidden={householdView !== "all"}><div className="household-toolbar">
            <div className="filter-group" aria-label="Filter household ledger">
              {(["all", "stable", "pressure", "failure", "displaced"] as const).map((filter) => <button key={filter} aria-pressed={householdFilter === filter} className={householdFilter === filter ? "is-active" : ""} onClick={() => setHouseholdFilter(filter)}>{filter}</button>)}
            </div>
            <label>Sort <select value={householdSort} onChange={(event) => setHouseholdSort(event.target.value as typeof householdSort)}><option value="id">house number</option><option value="debt">highest debt</option><option value="cash">highest cash</option><option value="compound">days in failure</option></select></label>
            <span>{householdRows.length} of 120 houses shown</span>
          </div>
          <div className="household-table-wrap">
            <table className="household-table" aria-label={`All households on ${formatDay(day)}`}>
              <thead><tr><th>House</th><th>Status</th><th>Food</th><th>Shelter</th><th>Safety</th><th>Health</th><th>Cash</th><th>Debt</th><th>Work</th><th>Commute</th><th>Compound days</th><th>Displaced ever</th></tr></thead>
              <tbody>
                {householdRows.length === 0 && <tr><td colSpan={12}>No households match this status on {formatDay(day)}. Try another day or choose “all”.</td></tr>}
                {householdRows.map((agent) => {
                  const status = getAgentStatus(agent);
                  return (
                    <tr key={agent.id} className={agent.id === focusedId ? "is-selected" : ""}>
                      <td><button aria-label={`View household ${String(agent.id + 1).padStart(3, "0")}`} onClick={() => { setSelectedId(agent.id); setHouseholdView("one"); singleHouseholdButton.current?.focus(); }}>#{String(agent.id + 1).padStart(3, "0")}</button></td>
                      <td><span className={`table-status table-status--${status.replace(" ", "-")}`}>{status}</span></td>
                      <td className={agent.food < .55 ? "is-low" : ""}>{Math.round(agent.food * 100)}</td>
                      <td className={agent.housing < .55 ? "is-low" : ""}>{Math.round(agent.housing * 100)}</td>
                      <td className={agent.safety < .55 ? "is-low" : ""}>{Math.round(agent.safety * 100)}</td>
                      <td className={agent.health < .55 ? "is-low" : ""}>{Math.round(agent.health * 100)}</td>
                      <td>{money(agent.cash)}</td><td>{money(agent.debt)}</td><td>{agent.employed ? "yes" : "no"}</td><td>{agent.commuteMinutes}m</td><td>{agent.daysInCompoundFailure}</td><td>{agent.everDisplaced ? "yes" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
        </section>

        <section id="debt-mechanism" className="evidence-section debt-explainer">
          <div className="evidence-heading">
            <div><span className="section-kicker">03 / Mechanism</span><h3>What “survival debt” means</h3></div>
            <p>It is not a personality trait or a consumer preference. In this model it is the balance created when a household has to keep surviving after cash has run out.</p>
          </div>
          <div className="debt-layout">
            <div className="debt-definition">
              <WalletCards size={24} />
              <p>Rent shortfalls are carried into debt with a fixed $38 late cost. Any negative cash left by utilities, transport or work losses, repairs, or health shocks is also converted into debt.</p>
              <div className="formula"><span>new balance</span><b>=</b><span>old debt</span><b>+</b><span>unpaid survival costs</span><b>+</b><span>0.072% daily interest</span></div>
              <small>0.072% per day is about 29.9% effective annual growth if a balance remains unpaid.</small>
            </div>
            <div className="debt-live">
              <span>At this frame</span><strong>{money(snapshot.metrics.totalDebt)}</strong><p>across {townLedger.debtHouseholds} of 120 households</p>
              <dl><div><dt>Median household debt</dt><dd>{money(townLedger.medianDebt)}</dd></div><div><dt>Largest balance</dt><dd>{money(townLedger.maximumDebt)}</dd></div><div><dt>Repayment begins</dt><dd>cash above $1,450</dd></div><div><dt>Cash buffer retained</dt><dd>$1,200</dd></div></dl>
            </div>
          </div>
          <div className="mechanism-chain" aria-label="Survival debt mechanism"><span>shock or fixed cost</span><i>→</i><span>cash gap</span><i>→</i><span>need still exists</span><i>→</i><span>shortfall becomes debt</span><i>→</i><span>future income pays for the past</span></div>
        </section>

        <section id="model-evidence" className="evidence-section lab-comparison">
          <div className="evidence-heading">
            <div><span className="section-kicker">04 / 1,000-world laboratory</span><h3>What the essay led us to expect — and what the model produced</h3></div>
            <p>Each lab run creates 1,000 independent seeded towns: 120,000 simulated household-years. We summarize outcomes by world so one unusually lucky or unlucky town cannot carry the claim.</p>
          </div>
          <div className="comparison-head"><span>Measure</span><span>Essay expectation</span><span>Observed mean</span><span>95% Monte Carlo interval</span></div>
          <div className="comparison-grid">
            {LAB_REFERENCE.map((item) => (
              <article key={item.label} className={`comparison-row comparison-row--${item.tone}`}>
                <div><strong>{item.label}</strong><span>{item.expected}</span></div>
                <div className="comparison-meter"><i style={{ width: `${item.observed}%` }} /><b>{item.observed.toFixed(2)}%</b></div>
                <code>{item.interval}%</code>
              </article>
            ))}
          </div>
          <div className="comparison-note">
            <p><b>What we expected:</b> approximately 90% stable at year end, nearly half experiencing compound failure, and roughly one in 24 chronically failing.</p>
            <p><b>What we observed:</b> the 1,000-world means land inside those targets. “Any hardship” and “displaced” are reported as model outputs, not retrofitted as essay claims.</p>
            <p><b>What this does not prove:</b> these intervals describe variation generated by this model. They are not confidence intervals for poverty in the real population.</p>
          </div>
          <Link className="primary-button lab-cta" href="/laboratory"><Dices size={16} /> Open the laboratory and run your own 1,000 worlds</Link>
        </section>

        <section className="evidence-section metric-definitions">
          <div className="evidence-heading"><div><span className="section-kicker">05 / Reading the record</span><h3>Exactly what each measure counts</h3></div><p>The model keeps end state, lived experience, chronic duration, and displacement separate. A household can recover by day 364 and still appear in a path-dependent measure.</p></div>
          <div className="definition-cards">
            <article><span>01</span><h4>Stable now</h4><p>Food, housing, and safety are each at or above 55 on the selected day.</p></article>
            <article><span>02</span><h4>Any hardship</h4><p>At least one core need fell below 55 at any point in the year.</p></article>
            <article><span>03</span><h4>Compound failure</h4><p>Two or more core needs were below 55 on the same day.</p></article>
            <article><span>04</span><h4>Chronic failure</h4><p>More than half the simulated year was spent in compound failure.</p></article>
            <article><span>05</span><h4>Displaced</h4><p>Housing fell below 12, triggering loss of home and a recovery barrier. It is not every episode of poverty.</p></article>
          </div>
          <footer className="evidence-footer"><span>Agency · model 0.4.0</span><a href="https://eliasmarrow.org/read/essays/effort-was-held-constant.html" target="_blank" rel="noreferrer">Read “Effort Was Held Constant” <ArrowRight size={14} /></a></footer>
        </section>
      </section>

      <dialog ref={methodDialog} className="about-panel" aria-labelledby="method-title" onClose={() => setShowAbout(false)}>
          <button className="icon-button modal-close" onClick={() => setShowAbout(false)} aria-label="Close method"><X size={17} /></button>
          <span className="eyebrow"><BarChart3 size={13} /> What this world tests</span>
          <h2 id="method-title">The environment is the variable.</h2>
          <p>
            The fair control fixes effort, starting cash, wage, health, needs, actions, and opportunity. Only the daily roll changes. The layered version adds four explicit constraints so their effect can be measured against that control.
          </p>
          <ol>
            <li><b>Control first</b><span>Equal inputs and opportunities isolate the effect of sequence and chance.</span></li>
            <li><b>Add one constraint</b><span>Transportation, health, access, and education can be switched on independently in the laboratory.</span></li>
            <li><b>Measure paths</b><span>Any hardship, compound failure, chronic failure, and displacement remain distinct outcomes.</span></li>
            <li><b>Keep the boundary honest</b><span>The model illustrates mechanisms; it does not estimate the real population.</span></li>
          </ol>
          <a href="https://eliasmarrow.org/read/essays/effort-was-held-constant.html" target="_blank" rel="noreferrer">Read the source essay <ArrowRight size={14} /></a>
      </dialog>
    </main>
  );
}
