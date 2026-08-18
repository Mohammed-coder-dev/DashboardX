// Output shape is enforced by the JSON schemas in schemas.js, so prompts
// only carry the analytical instructions.
import { representativeSample } from "./analytics/sample.js";

/**
 * Render the representative sample with the reason each row was selected, so
 * the model treats it as a deliberate cross-section rather than a preview it
 * should generalise from.
 */
function renderSample(sample) {
  if (!sample || sample.rows.length === 0) return "none";
  const labelled = sample.rows.map((row, i) => ({
    selectedBecause: sample.selections[i]?.reasons.join(", ") ?? "sample",
    row,
  }));
  return `${sample.rows.length} of ${sample.totalRows} rows, chosen to span boundaries, central values, missing cells, outliers and category examples:
${JSON.stringify(labelled, null, 2)}`;
}

/**
 * The computed results minus the parts that exist only to be drawn.
 *
 * The payload a browser receives and the payload a model should read are not
 * the same object, and rendering the first into a prompt made every field added
 * for the UI into prompt content by accident. Two of them are unbounded in
 * dataset size: `outliers.rows` ships up to 200 flagged rows per numeric column
 * (schema 2.10, added for the column drill-down), and a correlation's `scatter`
 * ships up to 500 paired observations (schema 2.9, added for plotting).
 * Measured on a 20,000-row, 12-column file, the prompt reached ~365,000
 * characters — roughly 91,000 tokens — of which 2,400 serialised outlier rows
 * were the bulk. The visitor pays for that with their own key.
 *
 * The model is asked to explain evidence, not to plot it: it keeps the outlier
 * count, the fences and the method, every coefficient with its n, coverage and
 * caveats, the histogram shape and the category frequencies. Nothing it is
 * asked to reason about is removed — only the row-level and point-level
 * material it cannot use and was never meant to see.
 */
function forPrompt(stats, correlations) {
  const leanStats = {};
  for (const [column, field] of Object.entries(stats ?? {})) {
    if (!field || typeof field !== "object" || !field.outliers?.rows) {
      leanStats[column] = field;
      continue;
    }
    const { rows: flaggedRows, rowsCap, ...outliers } = field.outliers;
    leanStats[column] = { ...field, outliers: { ...outliers, rowsReported: flaggedRows.length } };
  }
  const leanCorrelations = (correlations ?? []).map((correlation) => {
    if (!correlation?.scatter) return correlation;
    const { scatter, ...rest } = correlation;
    return rest;
  });
  return { stats: leanStats, correlations: leanCorrelations };
}

export function buildTabularPrompt(columns, stats, correlations, rows, question, profileSummary, evidence) {
  // Sampled before the trim, deliberately: representativeSample picks outlier
  // rows using the fences in the full stats object.
  const sample = Array.isArray(rows) ? representativeSample(rows, columns, stats) : rows;
  ({ stats, correlations } = forPrompt(stats, correlations));
  return `You are Ridge, an expert data analyst. Explain this dataset's computed evidence.
COLUMNS: ${columns.join(", ")}
STATISTICS: ${JSON.stringify(stats, null, 2)}
CORRELATIONS: ${JSON.stringify(correlations, null, 2)}
${evidence?.length ? `DETERMINISTIC EVIDENCE (each object: claim, metric, columns, method, sampleSize, coverage, strength, caveat):
${JSON.stringify(evidence, null, 2)}
` : ""}DATA QUALITY PROFILE: ${profileSummary || "not computed"}
REPRESENTATIVE ROWS: ${renderSample(sample)}
USER QUESTION: ${question || "Give me a full analysis."}
Provide 3-6 insights (with concrete numbers), 3-5 variable explanations, and 2-4 chart suggestions whose x/y reference real column names. Leave topics empty.

Ground every number in the statistics, correlations and evidence above — they are already computed, so quote them rather than recalculating from the sample rows. The representative rows are a deliberate cross-section, not a random preview: never infer a total, average or distribution from them. Your role with the evidence objects is to summarize and contextualize them; never invent numbers they do not contain, and carry their caveats forward. Report a correlation only with its sample size and note when a relationship rests on few paired observations or low coverage. Say "associated with", not "causes", unless the dataset itself establishes ordering — if you offer a possible explanation, label it explicitly as a hypothesis. When the quality profile shows real problems (missing data, mixed types, duplicates, outliers), reflect them in your insights and caveats instead of ignoring them.`;
}

export function buildTextPrompt(fileType, rawText, question) {
  const labels = { pdf:"PDF document", text:"text file", presentation:"PowerPoint presentation", document:"Word document", json:"JSON file" };
  return `You are Ridge, an expert analyst. Analyze this ${labels[fileType]||"document"}.
CONTENT: ${rawText}
USER QUESTION: ${question || "Analyze this document comprehensively."}
Provide 4-7 insights and 3-6 key topics. Use the variables list for the document's key sections. Leave charts empty.`;
}

export function buildFollowUpPrompt(context, question, priorQA) {
  const qa = (priorQA || []).map(p => `Q: ${p.q}\nA: ${p.a}`).join("\n");
  return `You are Ridge, answering a follow-up question about a dataset the user already analyzed.
DATASET: "${context.filename}" — columns: ${context.columns.join(", ")}
STATISTICS: ${JSON.stringify(context.stats)}
CORRELATIONS: ${JSON.stringify(context.correlations)}
DATA QUALITY: ${context.profileSummary || "not computed"}
SAMPLE ROWS: ${JSON.stringify(context.sampleRows)}
${context.rawText ? `DOCUMENT EXCERPT: ${context.rawText}\n` : ""}${qa ? `EARLIER FOLLOW-UPS:\n${qa}\n` : ""}QUESTION: ${question}
Answer in under 200 words of plain prose (no markdown headers or bullets), grounded in the numbers above. If this context cannot answer the question, say so and name exactly what additional data would be needed.`;
}

export function buildCrossSummaryPrompt(fileResults, question) {
  const summaries = fileResults.map((r, i) =>
    `FILE ${i+1} — "${r.filename}" (${r.fileType}):\nSummary: ${r.analysis.summary}\nConclusion: ${r.analysis.conclusion}\nTop insights: ${r.analysis.insights.slice(0,3).map(ins => ins.title + ": " + ins.detail).join(" | ")}`
  ).join("\n\n");

  return `You are Ridge. The user uploaded ${fileResults.length} files and you have analyzed each one individually. Now provide a cross-file synthesis.

INDIVIDUAL ANALYSES:
${summaries}

USER QUESTION: ${question || "What are the key patterns, similarities, and differences across all these files?"}

Provide 2-4 common themes, 2-3 differences, and 3-5 cross-file insights.`;
}
