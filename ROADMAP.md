# Roadmap

Ridge's thesis: **numbers are computed, never generated.** Everything below
either strengthens the deterministic engine or makes its evidence easier to
trust. Anything that would move a statistic into the model's hands is out of
scope by construction.

## Shipped — v2.1.0

- Deterministic engine usable with no API key at all.
- Evidence Mode: structured claims with method, sample size, coverage, strength
  and caveats; optional target column for focused evidence.
- Pairwise-complete correlations (Pearson + Spearman) that never turn a blank
  cell into a zero.
- Frequency-ranked categorical profiles; numeric coverage and invalid counts;
  full date profiling with trend, period-over-period and gap detection.
- Deterministic representative sampling in place of an arbitrary row preview.
- Opt-in persistence, deletable saved analyses, session-scoped keys.
- JSON and printable-report exports carrying schema and engine versions.
- The application at the root URL; `/about`, `/privacy`, `/docs`.
- Full-file deterministic charts for numeric distributions, category frequencies,
  and date trends, available without an API key.

## Shipped after v2.1.0

- 95% mean intervals, Welch group/file comparisons with explicit unadjusted
  exploratory caveats, categorical chi-square with Cramér's V, two-sample KS
  distribution shifts, and robust candidate level-shift detection.
- Evidence provenance drill-downs with formulas, inclusion/exclusion accounting,
  and bounded source-row excerpts.
- Two-file baseline/current comparison mode with schema and quality deltas.
- Structural inference at ingest: the header located by span against the data
  block, preamble and aggregate rows excluded from every statistic, aggregates
  found by label *and* by column-wise arithmetic so unlabelled totals are caught
  too. Uncertain readings are declared rather than resolved quietly, everything
  excluded is reported, and both the header row and individual rows are
  correctable.

## Next — strengthening the evidence

- **Excel serial dates.** Date parsing is deliberately pattern-gated so integer
  measurements are never read as timelines. Detect true Excel serials from cell
  formatting in the workbook rather than guessing from the value.
- **Structural shapes still out of scope.** Grouped or hierarchical subtotals,
  multi-row merged headers, transposed sheets, several tables in one sheet, and
  non-English total labels are not attempted. Where they are visible at all they
  surface as an uncertain reading; they are never silently guessed at.

## Next — the product surface

- **Column drill-down** — the full distribution and outlier list for one field.
- **Saved comparison alerts** — rerun a baseline/current comparison on a
  schedule and notify only when a governed threshold is crossed.

## Considered and declined

- **Natural-language querying of the data.** It would put arithmetic back in
  the model's hands. Follow-up questions stay grounded in computed context.
- **Model-generated statistics of any kind**, including "estimated" values.
- **Accounts and multi-user workspaces.** The product is deliberately
  session-scoped and anonymous; accounts would force a durable identity store.
- **Storing uploads.** Files stay in memory. Only an explicitly saved analysis
  *result* is persisted, never the source file.

## Operational

- Screenshot regeneration in CI so README images cannot drift from the UI.
- A Lighthouse budget as a required check.
- Configurable retention or expiry for saved analyses.
