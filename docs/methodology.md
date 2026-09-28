# Methodology

## Research question

Can repeated stochastic shocks create materially unequal outcomes when starting resources, effort, actions, and baseline opportunity are held constant?

Agency answers only that model question. It does not estimate the prevalence or causes of poverty in a real population.

## Unit of simulation

One world contains 120 synthetic households and 364 daily transitions. Every control-world household begins with the same cash, rent, wage, hours, employment, need scores, and effort. The seeded pseudo-random sequence is the only source of variation between otherwise identical households.

The pseudo-random generator is Mulberry32. A string seed is first converted to a 32-bit value with FNV-1a. A complete seed therefore reproduces the same daily shocks and outcomes on every run of the same model version.

## Daily process

For every household and day, the model:

1. credits wages or eligible unemployment support;
2. charges utilities, transportation, and food;
3. evaluates health, transportation, and scheduling shocks;
4. evaluates job loss and re-employment;
5. charges rent every 30 days;
6. converts unpaid survival costs into debt;
7. updates food, housing, safety, health, stress, and displacement state;
8. records path-dependent outcomes.

The full rule implementation is in `lib/simulation.ts`.

## Control and structural layers

The base control disables all four structural layers. The layered condition enables:

- transportation: longer commutes, higher costs, and additional reliability risk;
- health: higher incidence and cost with slower recovery;
- access: longer benefit delays and recovery friction;
- education: lower starting wage and reduced re-entry probability.

These layers are explicit modeling assumptions, not fitted causal effects.

## Operational definitions

- **Stable at year end:** food, housing, and safety are each at or above 0.55 on day 364.
- **Any basic need failed:** at least one of food, housing, or safety fell below 0.55 at any point.
- **Ever in compound failure:** at least two of those needs were below 0.55 on the same day.
- **Chronic failure:** compound failure persisted for more than half the simulated year.
- **Ever displaced:** housing crossed below 0.12, triggering loss of home and a recovery barrier.
- **Survival debt:** unpaid survival costs plus a fixed rent-shortfall fee and daily interest, less later repayment above the retained cash buffer.

End state and lived experience are deliberately separate. A household may recover by day 364 while still appearing in a path-dependent measure.

## Monte Carlo experiment

The canonical experiment creates 1,000 independent seeded worlds, or 120,000 synthetic household-years. Each world yields five percentages. The project reports their mean, median, sample standard deviation, p10, p90, minimum, maximum, and a normal-approximation 95% interval for the mean.

The interval describes uncertainty in the simulated world mean under these rules. It is not a confidence interval for poverty in the United States or any other population.

## Calibration and falsifiability

The control was calibrated to three aggregate statements in *Effort Was Held Constant*. The remaining outputs are reported as model consequences rather than retrofitted essay claims. All parameters, thresholds, rules, seeds, and raw outcomes are public so others can vary or reject them.

Model version: `0.4.0`.
