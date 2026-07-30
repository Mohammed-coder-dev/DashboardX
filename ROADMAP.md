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

## Next — strengthening the evidence

- **Significance and intervals.** Group comparisons report a standardized
  effect size but no p-value or confidence interval. Add both, with an honest
  note about multiple comparisons across many column pairs.
- **Categorical-vs-categorical evidence.** Chi-square or Cramér's V for
  association between two category columns, which the engine cannot express
  today.
- **Excel serial dates.** Date parsing is deliberately pattern-gated so integer
  measurements are never read as timelines. Detect true Excel serials from cell
  formatting in the workbook rather than guessing from the value.
- **Evidence provenance in the UI.** Click a claim to see the exact rows and
  computation behind it, closing the loop from claim back to raw data.

## Next — the product surface

- **Charts from evidence, not from the model.** Chart specs currently arrive in
  the AI response, so keyless analyses get no charts. Derive them
  deterministically from column types and evidence so they appear without a key.
- **Whole-file charting.** Charts render from up to 100 sample rows while the
  statistics above them cover the whole file. Aggregate server-side so the two
  agree.
- **Column drill-down** — the full distribution and outlier list for one field.
- **Comparison mode** — same schema, two files, what changed.

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
