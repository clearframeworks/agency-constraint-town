# Reference Monte Carlo data

`reference/base-1000-worlds.csv` contains one row per deterministic world. `reference/base-1000-worlds.json` contains the same raw outcomes plus the exact seed, model version, parameters, modules, and aggregate summaries.

## Columns

| Column | Unit | Definition |
|---|---|---|
| `run` | integer | One-based run number |
| `seed` | string | Complete deterministic world seed |
| `finalStablePct` | percent | Stable on day 364 |
| `everAnyFailurePct` | percent | Any core need failed at least once |
| `everCompoundFailurePct` | percent | Two or more core needs failed together at least once |
| `chronicFailurePct` | percent | Compound failure for more than half the year |
| `everDisplacedPct` | percent | Housing crossed the displacement threshold |

## Regeneration

```bash
npm run monte-carlo -- --seed agency-lab-0001 --runs 1000 --mode base --out data/reference/base-1000-worlds
npm run verify:reference
```

The `generatedAt` timestamp in JSON will change. Raw outcomes and statistical summaries must not change unless the model or inputs change.

The dataset is released under the repository's MIT license.
