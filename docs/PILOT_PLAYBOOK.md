# Ridge five-user pilot playbook

This is the operating plan for turning Ridge from a polished product into
evidence of demand. It is intentionally small: five real users, real recurring
spreadsheet work, and observable return behaviour. Do not turn interview praise
into traction; the strongest signal is a second unprompted use.

## Pilot question

Can Ridge help finance, operations, or analytics professionals reach a
defensible answer from a spreadsheet faster, while giving them enough
traceability to trust and share the result?

## Recruit five people

Choose participants who receive a spreadsheet they did not build at least
monthly. Aim for:

- two finance or revenue users;
- two operations or strategy users;
- one data or analytics user;
- at least two people who can test a recurring baseline/current comparison;
- at least one person whose company would require private deployment.

Do not recruit only friends who want to be supportive. A useful participant has
a real decision, a real file, and the authority to say the product is not good
enough.

### Outreach script

> I am testing Ridge, a tool that computes spreadsheet quality, statistics,
> comparisons, and traceable evidence before any AI explanation. Could I watch
> you use it on a non-sensitive or redacted version of a real recurring file for
> 25 minutes? I am looking for where it fails, not compliments. I will not ask
> you to send me the file.

## Session protocol — 25 minutes

1. **Context, 4 minutes.** Ask what decision the file supports, how often it
   arrives, what they do today, and what a wrong answer would cost.
2. **First run, 8 minutes.** Give only the URL. Ask them to analyze the file and
   narrate what they expect. Do not explain the interface unless they are fully
   blocked.
3. **Trust test, 5 minutes.** Ask them to choose one finding they might share,
   inspect its formula and source rows, and explain whether they trust it.
4. **Comparison, 4 minutes.** If they have two safe versions, ask what changed.
   Observe whether schema drift, intervals, or distribution shifts answer the
   real question.
5. **Close, 4 minutes.** Ask what was missing, what they would replace, and
   whether they will use Ridge on the next occurrence. Never ask “Would you pay
   for this?” without a concrete workflow and buyer.

Do not collect their file. Screen recording requires explicit permission. Ask
participants to use redacted or synthetic data when policy requires it.

## What to record

Use one row per session in a private tracker:

| Field | Record |
|---|---|
| Participant | Anonymous code, role, company size band |
| Job | Decision and current workflow |
| Frequency | Weekly, monthly, ad hoc |
| Time to first result | Minutes from opening Ridge |
| Independent completion | Yes/no; where help was needed |
| Trusted finding | Which result and why |
| Trust failure | Exact hesitation or verification gap |
| Blocking issue | One highest-impact blocker |
| Deployment requirement | Hosted, private container, internal API |
| Return event | Date of an actual second use, not stated intent |

Use the repository's **Pilot feedback** issue form only for non-confidential
product feedback. Never paste source rows or customer data into GitHub.

## Decision thresholds after five sessions

Continue the current wedge if all are true:

- at least 4/5 complete a useful first analysis in under five minutes;
- at least 4/5 can verify one finding using its provenance without help;
- at least 3/5 identify a recurring workflow Ridge fits;
- at least 2/5 actually return for a second file within seven days.

Treat an explicit private-deployment request as a strong enterprise signal, but
not as usage. If fewer than two people return, narrow the use case before adding
accounts, collaboration, or more infrastructure.

## Weekly founder readout

Report facts, not adjectives:

- sessions completed and roles represented;
- median time to first useful result;
- independent completion rate;
- provenance verification rate;
- seven-day return count;
- repeated blockers, grouped only after the raw notes are captured;
- one product decision for the next week.

For an accelerator application, say “2 of 5 pilot users returned within seven
days” only after it happens. Until then, describe the product capability and the
pilot currently underway—never manufacture traction.
