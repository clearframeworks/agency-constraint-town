# Parameter register

The canonical values below are defined in `lib/simulation.ts`. That file is the executable authority; this document explains the intent of each value.

| Parameter | Canonical value | Meaning |
|---|---:|---|
| Population | 120 | Synthetic households per world |
| Days | 364 | Daily transitions per world |
| Starting cash | $1,400 | Equal opening liquid buffer |
| Monthly rent | $980 | Charged every 30 days |
| Hourly wage | $17.25 | Equal control-world wage |
| Weekly hours | 36 | Equal control-world schedule |
| Wage take-home factor | 0.78 | Gross-to-available-pay multiplier |
| Rent increase | 6% | Applied to every household on day 181 |
| Shock-frequency multiplier | 1.4× | Multiplies health, transport, and schedule probabilities |
| Maximum job losses | 2 | Per household per year |
| Recovery-barrier chance | 55% | Applied once when displacement occurs |
| Food threshold | 0.55 | Below this is food insecurity |
| Housing threshold | 0.55 | Below this is housing instability |
| Safety threshold | 0.55 | Below this is safety failure |
| Displacement threshold | 0.12 | Housing crossing this level triggers displacement |
| Daily debt interest | 0.072% | About 29.9% effective annual growth if continuously unpaid |
| Rent-shortfall fee | $38 | Added when rent cannot be met |
| Repayment cash trigger | $1,450 | Debt repayment begins above this cash balance |
| Retained cash buffer | $1,200 | Cash protected while repaying debt |

## Daily fixed flows

| Flow | Value |
|---|---:|
| Food | $14.30/day |
| Utilities | $8.60/day |
| Base transportation | $4.85/day |
| Weekly unemployment support | $118 |

## Shock probabilities

Probabilities are evaluated independently per household-day using the seeded generator. Several depend on current state, so the formulas—not only a single headline probability—matter.

- Health shock: `(0.0025 + stress × 0.0018 + health-layer penalty) × shock frequency`.
- Transport shock: `(0.00175 + commute-layer penalty) × shock frequency`.
- Schedule shock while employed: `0.0031 × shock frequency`.
- Job loss after a missed shift: `0.10`, subject to the annual maximum.
- Re-employment: begins at `0.067/day` and is reduced by access, education, and stress penalties, with a floor of `0.008/day`.

## Important modeling choices

- Effort is fixed; there is no effort variable that can fall after stress or hardship.
- A rent increase affects every household equally in the control.
- Survival debt is an accounting mechanism created by shortfalls, not a personality attribute.
- Displacement is not synonymous with poverty or any basic-need failure.
- The interface reports all need scores as percentages, while the engine stores them from 0 to 1.
