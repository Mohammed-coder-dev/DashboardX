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

export function buildTabularPrompt(columns, stats, correlations, rows, question, profileSummary) {
  const sample = Array.isArray(rows) ? representativeSample(rows, columns, stats) : rows;
  return `You are DashboardX, an expert data analyst. Explain this dataset's computed evidence.
COLUMNS: ${columns.join(", ")}
STATISTICS: ${JSON.stringify(stats, null, 2)}
CORRELATIONS: ${JSON.stringify(correlations, null, 2)}
DATA QUALITY PROFILE: ${profileSummary || "not computed"}
REPRESENTATIVE ROWS: ${renderSample(sample)}
USER QUESTION: ${question || "Give me a full analysis."}
Provide 3-6 insights (with concrete numbers), 3-5 variable explanations, and 2-4 chart suggestions whose x/y reference real column names. Leave topics empty.

Ground every number in the statistics, correlations and evidence above — they are already computed, so quote them rather than recalculating from the sample rows. The representative rows are a deliberate cross-section, not a random preview: never infer a total, average or distribution from them. Report a correlation only with its sample size and note when a relationship rests on few paired observations or low coverage. Say "associated with", not "causes", unless the dataset itself establishes ordering. When the quality profile shows real problems (missing data, mixed types, duplicates, outliers), reflect them in your insights and caveats instead of ignoring them.`;
}

export function buildTextPrompt(fileType, rawText, question) {
  const labels = { pdf:"PDF document", text:"text file", presentation:"PowerPoint presentation", document:"Word document", json:"JSON file" };
  return `You are DashboardX, an expert analyst. Analyze this ${labels[fileType]||"document"}.
CONTENT: ${rawText}
USER QUESTION: ${question || "Analyze this document comprehensively."}
Provide 4-7 insights and 3-6 key topics. Use the variables list for the document's key sections. Leave charts empty.`;
}

export function buildFollowUpPrompt(context, question, priorQA) {
  const qa = (priorQA || []).map(p => `Q: ${p.q}\nA: ${p.a}`).join("\n");
  return `You are DashboardX, answering a follow-up question about a dataset the user already analyzed.
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

  return `You are DashboardX. The user uploaded ${fileResults.length} files and you have analyzed each one individually. Now provide a cross-file synthesis.

INDIVIDUAL ANALYSES:
${summaries}

USER QUESTION: ${question || "What are the key patterns, similarities, and differences across all these files?"}

Provide 2-4 common themes, 2-3 differences, and 3-5 cross-file insights.`;
}
