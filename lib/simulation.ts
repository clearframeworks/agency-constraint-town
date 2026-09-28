export const DAYS_IN_YEAR = 364;
export const POPULATION = 120;
export const MODEL_VERSION = "0.4.0";

export type SimulationParameters = {
  startingCash: number;
  monthlyRent: number;
  hourlyWage: number;
  weeklyHours: number;
  rentIncreasePct: number;
  shockFrequency: number;
  maxJobLosses: number;
  recoveryBarrierChance: number;
};

export type SimulationModules = {
  transportation: boolean;
  health: boolean;
  access: boolean;
  education: boolean;
};

export const BASE_MODULES: SimulationModules = {
  transportation: false,
  health: false,
  access: false,
  education: false,
};

export const LAYERED_MODULES: SimulationModules = {
  transportation: true,
  health: true,
  access: true,
  education: true,
};

export const DEFAULT_PARAMETERS: SimulationParameters = {
  startingCash: 1400,
  monthlyRent: 980,
  hourlyWage: 17.25,
  weeklyHours: 36,
  rentIncreasePct: 0.06,
  shockFrequency: 1.4,
  maxJobLosses: 2,
  recoveryBarrierChance: 0.55,
};

export type EventKind =
  | "income"
  | "housing"
  | "food"
  | "health"
  | "transport"
  | "work"
  | "system"
  | "recovery";

export type SimulationEvent = {
  id: string;
  day: number;
  agentId: number | null;
  kind: EventKind;
  title: string;
  detail: string;
};

export type AgentSnapshot = {
  id: number;
  zone: number;
  cash: number;
  debt: number;
  food: number;
  housing: number;
  safety: number;
  health: number;
  stress: number;
  employed: boolean;
  commuteMinutes: number;
  daysInCompoundFailure: number;
  missedShifts: number;
  rent: number;
  wage: number;
  everDisplaced: boolean;
  transportationLimited: boolean;
  healthLimited: boolean;
  accessLimited: boolean;
  educationLimited: boolean;
};

export type TownMetrics = {
  stablePct: number;
  foodInsecurePct: number;
  housingUnstablePct: number;
  compoundFailurePct: number;
  chronicFailurePct: number;
  employedPct: number;
  displacedPct: number;
  totalDebt: number;
  medianCash: number;
};

export type DaySnapshot = {
  day: number;
  agents: AgentSnapshot[];
  metrics: TownMetrics;
  events: SimulationEvent[];
};

export type SimulationOutcomes = {
  finalStablePct: number;
  everAnyFailurePct: number;
  everCompoundFailurePct: number;
  chronicFailurePct: number;
  everDisplacedPct: number;
};

export type SimulationRun = {
  seed: string;
  modules: SimulationModules;
  snapshots: DaySnapshot[];
  series: TownMetrics[];
  outcomes: SimulationOutcomes;
};

type AgentState = Omit<AgentSnapshot, "everDisplaced"> & {
  everAnyFailure: boolean;
  everCompoundFailure: boolean;
  everEvicted: boolean;
  jobLosses: number;
  recoveryBlocked: boolean;
  daysWithoutWork: number;
  benefitDelay: number;
};

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pct = (value: number, total: number) => Number(((value / total) * 100).toFixed(1));

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function getMetrics(agents: AgentState[], day: number): TownMetrics {
  const stable = agents.filter((a) => a.food >= 0.55 && a.housing >= 0.55 && a.safety >= 0.55).length;
  const foodInsecure = agents.filter((a) => a.food < 0.55).length;
  const housingUnstable = agents.filter((a) => a.housing < 0.55).length;
  const compound = agents.filter((a) => [a.food, a.housing, a.safety].filter((v) => v < 0.55).length >= 2).length;
  const chronic = agents.filter((a) => a.daysInCompoundFailure > Math.max(14, day * 0.5)).length;
  const employed = agents.filter((a) => a.employed).length;

  return {
    stablePct: pct(stable, agents.length),
    foodInsecurePct: pct(foodInsecure, agents.length),
    housingUnstablePct: pct(housingUnstable, agents.length),
    compoundFailurePct: pct(compound, agents.length),
    chronicFailurePct: pct(chronic, agents.length),
    employedPct: pct(employed, agents.length),
    displacedPct: pct(agents.filter((a) => a.everEvicted && a.housing < 0.55).length, agents.length),
    totalDebt: Math.round(agents.reduce((sum, a) => sum + a.debt, 0)),
    medianCash: Math.round(median(agents.map((a) => a.cash))),
  };
}

function publicAgent(agent: AgentState): AgentSnapshot {
  const { everAnyFailure: _a, everCompoundFailure: _b, everEvicted: _c, jobLosses: _d, recoveryBlocked: _e, daysWithoutWork: _f, benefitDelay: _g, ...snapshot } = agent;
  return { ...snapshot, everDisplaced: agent.everEvicted };
}

function pushEvent(
  events: SimulationEvent[],
  day: number,
  agentId: number | null,
  kind: EventKind,
  title: string,
  detail: string,
) {
  events.push({ id: `${day}-${agentId ?? "town"}-${events.length}`, day, agentId, kind, title, detail });
}

export function simulateTown(
  seed: string,
  options: {
    collectHistory?: boolean;
    parameters?: Partial<SimulationParameters>;
    modules?: Partial<SimulationModules>;
  } = {},
): SimulationRun {
  const collectHistory = options.collectHistory ?? true;
  const parameters = { ...DEFAULT_PARAMETERS, ...options.parameters };
  const modules = { ...BASE_MODULES, ...options.modules };
  const random = mulberry32(hashSeed(seed));
  const agents: AgentState[] = Array.from({ length: POPULATION }, (_, id) => {
    const zone = id % 5;
    const transportationLimited = modules.transportation && zone >= 3;
    const healthLimited = modules.health && id % 5 === 1;
    const accessLimited = modules.access && id % 4 === 2;
    const educationLimited = modules.education && id % 4 === 3;
    return {
      id,
      zone,
      cash: parameters.startingCash,
      debt: 0,
      food: 1,
      housing: 1,
      safety: 1,
      health: 1,
      stress: 0.08,
      employed: true,
      commuteMinutes: transportationLimited ? 38 + (zone - 3) * 12 : 30,
      daysInCompoundFailure: 0,
      missedShifts: 0,
      rent: parameters.monthlyRent,
      wage: educationLimited ? Number((parameters.hourlyWage * 0.82).toFixed(2)) : parameters.hourlyWage,
      transportationLimited,
      healthLimited,
      accessLimited,
      educationLimited,
      everAnyFailure: false,
      everCompoundFailure: false,
      everEvicted: false,
      jobLosses: 0,
      recoveryBlocked: false,
      daysWithoutWork: 0,
      benefitDelay: 0,
    };
  });

  const snapshots: DaySnapshot[] = [];
  const openingMetrics = getMetrics(agents, 0);
  if (collectHistory) snapshots.push({ day: 0, agents: agents.map(publicAgent), metrics: openingMetrics, events: [] });

  for (let day = 1; day <= DAYS_IN_YEAR; day += 1) {
    const events: SimulationEvent[] = [];

    if (day === 181) {
      pushEvent(events, day, null, "system", "Rent repriced", "Every lease rises 6%. No household receives a corresponding wage adjustment.");
      agents.forEach((agent) => {
        agent.rent = Math.round(agent.rent * (1 + parameters.rentIncreasePct));
      });
    }

    if (day === 244 && modules.transportation) {
      pushEvent(events, day, null, "system", "Bus route reduced", "The late route is cut. Commutes in the outer districts become less reliable.");
      agents.forEach((agent) => {
        if (agent.transportationLimited) agent.commuteMinutes += 14;
      });
    }

    agents.forEach((agent) => {
      const dayEvents: SimulationEvent[] = [];
      const dailyGross = agent.employed ? (agent.wage * parameters.weeklyHours * 0.78) / 7 : 0;
      const transitCost = 4.85 + (agent.transportationLimited ? agent.commuteMinutes * 0.055 : 0);
      const foodCost = 14.3;
      const utilityCost = 8.6;
      const stressFriction = 1 + agent.stress * 0.5;

      if (agent.employed) {
        agent.cash += dailyGross;
        agent.daysWithoutWork = 0;
      } else {
        agent.daysWithoutWork += 1;
        if (agent.benefitDelay > 0) agent.benefitDelay -= 1;
        if (agent.benefitDelay === 0 && day % 7 === 0) agent.cash += 118;

        const opportunityPenalty = (agent.accessLimited ? 0.024 : 0) + (agent.educationLimited ? 0.014 : 0);
        const rehireChance = Math.max(0.008, 0.067 - opportunityPenalty - agent.stress * 0.004);
        if (random() < rehireChance) {
          agent.employed = true;
          agent.missedShifts = 0;
          pushEvent(dayEvents, day, agent.id, "recovery", "Job found", "Employment returns, but the debt accumulated during the gap remains.");
        }
      }

      agent.cash -= utilityCost;

      if (agent.employed) {
        if (agent.cash >= transitCost) {
          agent.cash -= transitCost;
        } else {
          agent.missedShifts += 1;
          agent.stress = clamp(agent.stress + 0.05);
          agent.cash -= dailyGross * 0.72;
        }
      }

      if (agent.cash >= foodCost) {
        agent.cash -= foodCost;
        agent.food = clamp(agent.food + 0.013);
      } else {
        agent.food = clamp(agent.food - 0.052 * stressFriction);
        agent.stress = clamp(agent.stress + 0.035);
      }

      if (day % 30 === 0) {
        if (agent.cash >= agent.rent) {
          agent.cash -= agent.rent;
          agent.housing = clamp(agent.housing + (agent.recoveryBlocked ? 0.03 : 0.35));
        } else {
          const shortage = agent.rent - Math.max(0, agent.cash);
          agent.debt += shortage + 38;
          agent.cash = Math.min(0, agent.cash);
          agent.housing = clamp(agent.housing - 0.43 - shortage / 5200);
          agent.stress = clamp(agent.stress + 0.13);
          pushEvent(dayEvents, day, agent.id, "housing", "Rent shortfall", `$${Math.round(shortage)} is carried forward as survival debt.`);
        }
      }

      const healthShockChance = (0.0025 + agent.stress * 0.0018 + (agent.healthLimited ? 0.0018 : 0)) * parameters.shockFrequency;
      if (random() < healthShockChance) {
        const costMultiplier = agent.healthLimited ? 1.8 : 1;
        const cost = Math.round((90 + random() * 360) * costMultiplier);
        agent.cash -= cost;
        agent.health = clamp(agent.health - (0.08 + random() * (agent.healthLimited ? 0.34 : 0.18)));
        agent.missedShifts += agent.healthLimited ? 2 : 1;
        agent.stress = clamp(agent.stress + 0.08);
        pushEvent(dayEvents, day, agent.id, "health", "Health shock", `$${cost} leaves the household while paid time is lost.`);
      }

      const transportShockChance = (0.00175 + (agent.transportationLimited ? agent.commuteMinutes * 0.000045 : 0)) * parameters.shockFrequency;
      if (random() < transportShockChance) {
        const cost = 140 + Math.round(random() * (agent.transportationLimited ? 620 : 420));
        agent.cash -= cost;
        agent.missedShifts += 1;
        agent.stress = clamp(agent.stress + 0.07);
        pushEvent(dayEvents, day, agent.id, "transport", "Transport failure", `$${cost} in repairs and one missed shift. Distance turns inconvenience into risk.`);
      }

      const scheduleShockChance = agent.employed ? 0.0031 * parameters.shockFrequency : 0;
      if (random() < scheduleShockChance) {
        const loss = dailyGross * (2 + Math.floor(random() * 3));
        agent.cash -= loss;
        agent.missedShifts += 1;
        agent.stress = clamp(agent.stress + 0.06);
        pushEvent(dayEvents, day, agent.id, "work", "Hours cut", `$${Math.round(loss)} disappears from this pay cycle; fixed costs do not move.`);
      }

      if (agent.missedShifts >= 1 && agent.employed && agent.jobLosses < parameters.maxJobLosses && random() < 0.1) {
        agent.employed = false;
        agent.jobLosses += 1;
        agent.benefitDelay = (agent.accessLimited ? 30 : 12) + Math.floor(random() * (agent.accessLimited ? 26 : 16));
        agent.missedShifts = 0;
        pushEvent(dayEvents, day, agent.id, "work", "Job lost", "A chain of missed shifts becomes an employment break. Assistance begins only after a delay.");
      }

      if (agent.cash < 0) {
        agent.debt += Math.abs(agent.cash);
        agent.cash = 0;
      }

      if (agent.debt > 0) {
        agent.debt *= 1 + 0.00072;
        if (agent.cash > 1450) {
          const payment = Math.min(agent.debt, agent.cash - 1200);
          agent.cash -= payment;
          agent.debt -= payment;
        }
      }

      if (agent.housing < 0.55) {
        // Housing loss is also a safety loss. Employment helps with cash, but it
        // does not by itself restore a secure place to sleep.
        agent.safety = clamp(agent.safety - (agent.recoveryBlocked ? 0.004 : 0.0015));
      } else if (agent.food > 0.62 && agent.health > 0.62) {
        agent.safety = clamp(agent.safety + (agent.employed ? 0.02 : 0.009));
      }

      if (!agent.employed && agent.daysWithoutWork > 3 && agent.cash < agent.rent * 2.7) {
        agent.food = clamp(agent.food - 0.055);
        agent.safety = clamp(agent.safety - 0.045);
      }

      if (agent.housing < 1 && agent.cash > 0 && agent.employed) {
        agent.housing = clamp(agent.housing + (agent.recoveryBlocked ? 0.0012 : 0.006));
      }

      if (agent.housing < 0.12 && !agent.everEvicted) {
        agent.everEvicted = true;
        agent.recoveryBlocked = random() < Math.min(0.95, parameters.recoveryBarrierChance + (agent.accessLimited ? 0.28 : 0));
        agent.housing = 0.05;
        agent.safety = Math.min(agent.safety, 0.42);
        agent.stress = clamp(agent.stress + 0.2);
        pushEvent(dayEvents, day, agent.id, "housing", "Displaced", "The household leaves its home. Work, safety, and recovery all become more expensive.");
      }

      const failedNeeds = [agent.food, agent.housing, agent.safety].filter((value) => value < 0.55).length;
      if (failedNeeds >= 1) agent.everAnyFailure = true;
      if (failedNeeds >= 2) {
        agent.daysInCompoundFailure += 1;
        agent.everCompoundFailure = true;
        agent.stress = clamp(agent.stress + 0.008);
      } else {
        agent.stress = clamp(agent.stress - 0.003);
      }

      if (agent.health < 0.65) agent.health = clamp(agent.health + (agent.healthLimited ? 0.00045 : 0.0012));

      if (dayEvents.length > 0) events.push(...dayEvents);
    });

    const metrics = getMetrics(agents, day);
    if (collectHistory) {
      snapshots.push({
        day,
        agents: agents.map(publicAgent),
        metrics,
        events: events.slice(0, 12),
      });
    }
  }

  const finalMetrics = getMetrics(agents, DAYS_IN_YEAR);
  return {
    seed,
    modules,
    snapshots,
    series: snapshots.map((snapshot) => snapshot.metrics),
    outcomes: {
      finalStablePct: finalMetrics.stablePct,
      everAnyFailurePct: pct(agents.filter((a) => a.everAnyFailure).length, agents.length),
      everCompoundFailurePct: pct(agents.filter((a) => a.everCompoundFailure).length, agents.length),
      chronicFailurePct: pct(agents.filter((a) => a.daysInCompoundFailure > DAYS_IN_YEAR * 0.5).length, agents.length),
      everDisplacedPct: pct(agents.filter((a) => a.everEvicted).length, agents.length),
    },
  };
}

export type MonteCarloResult = {
  count: number;
  medianStable: number;
  lowerStable: number;
  upperStable: number;
  medianEverFailed: number;
  medianChronic: number;
};

export function runMonteCarlo(
  seed: string,
  count = 120,
  parameters?: Partial<SimulationParameters>,
): MonteCarloResult {
  const runs = Array.from(
    { length: count },
    (_, index) => simulateTown(`${seed}-${index + 1}`, { collectHistory: false, parameters }).outcomes,
  );
  const stable = runs.map((run) => run.finalStablePct).sort((a, b) => a - b);
  const failed = runs.map((run) => run.everCompoundFailurePct).sort((a, b) => a - b);
  const chronic = runs.map((run) => run.chronicFailurePct).sort((a, b) => a - b);
  const at = (values: number[], quantile: number) => values[Math.min(values.length - 1, Math.floor(values.length * quantile))];
  return {
    count,
    medianStable: at(stable, 0.5),
    lowerStable: at(stable, 0.1),
    upperStable: at(stable, 0.9),
    medianEverFailed: at(failed, 0.5),
    medianChronic: at(chronic, 0.5),
  };
}

export function getAgentStatus(agent: AgentSnapshot) {
  const failedNeeds = [agent.food, agent.housing, agent.safety].filter((value) => value < 0.55).length;
  if (agent.everDisplaced && agent.housing < 0.55) return "displaced";
  if (failedNeeds >= 2) return "compound failure";
  if (failedNeeds === 1 || agent.cash < 180) return "under pressure";
  return "stable";
}

export function formatDay(day: number) {
  const date = new Date(Date.UTC(2026, 0, 1));
  date.setUTCDate(date.getUTCDate() + day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
