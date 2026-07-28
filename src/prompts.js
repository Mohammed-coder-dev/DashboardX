// Output shape is enforced by the JSON schemas in schemas.js, so prompts
// only carry the analytical instructions.
export function buildTabularPrompt(columns, stats, correlations, sampleRows, question, profileSummary) {
  return `You are DashboardX, an expert data analyst. Analyze this dataset.
COLUMNS: ${columns.join(", ")}
STATISTICS: ${JSON.stringify(stats, null, 2)}
TOP CORRELATIONS: ${JSON.stringify(correlations, null, 2)}
DATA QUALITY PROFILE: ${profileSummary || "not computed"}
SAMPLE ROWS: ${JSON.stringify(sampleRows.slice(0, 5), null, 2)}
USER QUESTION: ${question || "Give me a full analysis."}
Provide 3-6 insights (with concrete numbers), 3-5 variable explanations, and 2-4 chart suggestions whose x/y reference real column names. When the quality profile shows real problems (missing data, mixed types, duplicates, outliers), reflect them in your insights and caveats instead of ignoring them. Leave topics empty.`;
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
