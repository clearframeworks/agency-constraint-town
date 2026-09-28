"use client";

import { useMemo } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatDay, getAgentStatus, type SimulationRun } from "@/lib/simulation";

type Props = {
  run: SimulationRun;
  day: number;
  focusedId: number;
  onSelect: (id: number) => void;
  onDayChange: (day: number) => void;
};

export function HouseholdJourney({ run, day, focusedId, onSelect, onDayChange }: Props) {
  const examplePaths = useMemo(() => {
    const everFailed = new Set<number>();
    for (const frame of run.snapshots) for (const agent of frame.agents) {
      if ([agent.food, agent.housing, agent.safety].some(value => value < .55)) everFailed.add(agent.id);
    }
    const last = run.snapshots[run.snapshots.length - 1].agents;
    return [
      { label: "A stable year", id: last.find(agent => !everFailed.has(agent.id))?.id },
      { label: "Hardship & recovery", id: last.find(agent => everFailed.has(agent.id) && [agent.food, agent.housing, agent.safety].every(value => value >= .55))?.id },
      { label: "Displacement", id: last.find(agent => agent.everDisplaced)?.id },
    ];
  }, [run]);
  const history = useMemo(() => run.snapshots.map(frame => frame.agents[focusedId]), [run, focusedId]);
  const turningPoints = useMemo(() => {
    const points = [{ day: 0, title: "The beginning", detail: "In the equal-ground control, cash, wage, needs and effort begin equal. Added constraints can change that starting position. Effort always remains fixed." }];
    let sawHardship = false, sawDebt = false, sawDisplacement = false, sawRecovery = false;
    history.forEach((agent, index) => {
      const failing = [agent.food, agent.housing, agent.safety].some(value => value < .55);
      if (index === 0) return;
      if (failing && !sawHardship) {
        points.push({ day: index, title: "A basic need goes unmet", detail: `${[agent.food < .55 ? "Food" : "", agent.housing < .55 ? "Housing" : "", agent.safety < .55 ? "Safety" : ""].filter(Boolean).join(", ")} below the model’s threshold. Effort remains at 100%.` });
        sawHardship = true;
      }
      if (agent.debt > 0 && !sawDebt) {
        points.push({ day: index, title: "Survival starts costing tomorrow", detail: `$${Math.round(agent.debt).toLocaleString()} in debt. Unpaid survival costs are now carried forward.` });
        sawDebt = true;
      }
      if (agent.everDisplaced && !sawDisplacement) {
        points.push({ day: index, title: "The household loses its home", detail: "Housing crossed the displacement threshold. The model adds barriers to recovery." });
        sawDisplacement = true;
      }
      if (!failing && sawHardship && !sawRecovery) {
        points.push({ day: index, title: "Core needs are met again", detail: "Food, housing and safety are back above the threshold. Earlier hardship remains part of the record." });
        sawRecovery = true;
      }
    });
    const last = history.length - 1;
    points.push({ day: last, title: "The year’s final frame", detail: sawHardship ? `${history[last].daysInCompoundFailure} days with multiple core needs failing across this year. A final status cannot describe that entire path.` : "This household’s food, housing and safety needs stayed above the threshold throughout the year. Explore another household to compare its path." });
    return points.sort((a, b) => a.day - b.day);
  }, [history]);
  const current = history[day];
  const currentEvents = run.snapshots[day].events.filter(event => event.agentId === focusedId);
  const pastPoints = turningPoints.filter(point => point.day <= day);
  const point = pastPoints[pastPoints.length - 1];
  const next = turningPoints.find(item => item.day > day);
  const previous = [...turningPoints].reverse().find(item => item.day < day);
  const cash = Math.round(current.cash).toLocaleString();
  return (
    <section id="household-story" className="household-journey" aria-labelledby="journey-title">
      <div className="journey-heading"><div><span className="section-kicker">01 / Stay with one household</span><h2 id="journey-title">A life is more than<br /><em>its last frame.</em></h2></div><p>No invented biography. No assigned blame. Follow one simulated household’s actual record, including the days that disappear from a year-end total.</p></div>
      <div className="example-paths"><span>Explore a path in this town</span>{examplePaths.map(example => <button key={example.label} disabled={example.id === undefined} title={example.id === undefined ? "This path did not occur in this town" : undefined} onClick={() => { if (example.id !== undefined) { onSelect(example.id); onDayChange(0); } }}>{example.label}<ArrowRight size={14} /></button>)}<small>Selected examples from the full year, not estimates of how common each path is.</small></div>
      <div className="journey-layout">
        <div className="household-passport">
          <label htmlFor="follow-household">Choose a household</label>
          <select id="follow-household" value={focusedId} onChange={event => onSelect(Number(event.target.value))}>{history[0] && run.snapshots[0].agents.map(agent => <option key={agent.id} value={agent.id}>Household {String(agent.id + 1).padStart(3, "0")}</option>)}</select>
          <span className="passport-district">District {current.zone + 1} · {formatDay(day)}</span>
          <div className={`passport-status status--${getAgentStatus(current).replaceAll(" ", "-")}`}>{getAgentStatus(current)}</div>
          <dl><div><dt>Cash available</dt><dd>${cash}</dd></div><div><dt>Survival debt</dt><dd>${Math.round(current.debt).toLocaleString()}</dd></div><div><dt>Days in compound failure</dt><dd>{current.daysInCompoundFailure}</dd></div><div><dt>Effort</dt><dd>100% <small>unchanged</small></dd></div></dl>
          <a href="#household-ledger">Inspect the full record <ArrowRight size={15} /></a>
        </div>
        <div className="journey-record">
          <div className="journey-chapters" aria-label="Household turning points">{turningPoints.map((item, index) => <button key={`${item.day}-${index}`} aria-pressed={item === point} onClick={() => onDayChange(item.day)}><span>{formatDay(item.day)}</span><i aria-hidden="true" /><strong>{item.title}</strong></button>)}</div>
          <div className="journey-moment" aria-live="polite"><span className="section-kicker">{formatDay(day)} · Day {day}</span><h3>{currentEvents[0]?.title ?? point.title}</h3><p>{currentEvents[0]?.detail ?? (day === point.day ? point.detail : `On this day: $${cash} in cash, $${Math.round(current.debt).toLocaleString()} in debt. ${current.employed ? "Employed" : "Not employed"}, with ${current.daysInCompoundFailure} days of compound failure so far.`)}</p></div>
          <div className="journey-actions"><button className="ghost-button" disabled={!previous} onClick={() => previous && onDayChange(previous.day)}><ArrowLeft size={15} /> Previous turning point</button><button className="primary-button" disabled={!next} onClick={() => next && onDayChange(next.day)}>Next turning point <ArrowRight size={15} /></button></div>
          <p className="journey-note">Turning points are selected milestones from this household’s full year, including future days. Use the timeline above to examine every day.</p>
        </div>
      </div>
    </section>
  );
}
