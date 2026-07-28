export function buildTabularPrompt(columns, stats, correlations, sampleRows, question) {
  return `You are DashboardX, an expert data analyst. Analyze this dataset.
COLUMNS: ${columns.join(", ")}
STATISTICS: ${JSON.stringify(stats, null, 2)}
TOP CORRELATIONS: ${JSON.stringify(correlations, null, 2)}
SAMPLE ROWS: ${JSON.stringify(sampleRows.slice(0, 5), null, 2)}
USER QUESTION: ${question || "Give me a full analysis."}
Respond ONLY as valid JSON with NO markdown fences:
{"summary":"<2-3 sentence overview>","insights":[{"title":"<title>","detail":"<detail with numbers>","type":"positive|negative|neutral|warning"}],"variables":[{"name":"<col>","explanation":"<what it represents>","notable":"<observation>"}],"charts":[{"type":"bar|line|scatter|pie","title":"<title>","x":"<col>","y":"<col or null>","reason":"<why>"}],"topics":[],"conclusion":"<2-3 sentence conclusion>"}
Provide 3-6 insights, 3-5 variables, 2-4 charts.`;
}

export function buildTextPrompt(fileType, rawText, question) {
  const labels = { pdf:"PDF document", text:"text file", presentation:"PowerPoint presentation", document:"Word document", json:"JSON file" };
  return `You are DashboardX, an expert analyst. Analyze this ${labels[fileType]||"document"}.
CONTENT: ${rawText}
USER QUESTION: ${question || "Analyze this document comprehensively."}
Respond ONLY as valid JSON with NO markdown fences:
{"summary":"<2-3 sentence overview>","insights":[{"title":"<title>","detail":"<finding>","type":"positive|negative|neutral|warning"}],"variables":[{"name":"<topic>","explanation":"<what it covers>","notable":"<observation>"}],"charts":[],"topics":[{"name":"<topic>","summary":"<brief summary>","importance":"high|medium|low"}],"conclusion":"<2-3 sentence conclusion>"}
Provide 4-7 insights and 3-6 key topics.`;
}

export function buildCrossSummaryPrompt(fileResults, question) {
  const summaries = fileResults.map((r, i) =>
    `FILE ${i+1} — "${r.filename}" (${r.fileType}):\nSummary: ${r.analysis.summary}\nConclusion: ${r.analysis.conclusion}\nTop insights: ${r.analysis.insights.slice(0,3).map(ins => ins.title + ": " + ins.detail).join(" | ")}`
  ).join("\n\n");

  return `You are DashboardX. The user uploaded ${fileResults.length} files and you have analyzed each one individually. Now provide a cross-file synthesis.

INDIVIDUAL ANALYSES:
${summaries}

USER QUESTION: ${question || "What are the key patterns, similarities, and differences across all these files?"}

Respond ONLY as valid JSON with NO markdown fences:
{
  "summary": "<2-3 sentence overview of what all files together represent>",
  "commonThemes": [{"theme":"<theme name>","detail":"<how it appears across files>"}],
  "differences": [{"aspect":"<aspect>","detail":"<how files differ>"}],
  "insights": [{"title":"<cross-file insight>","detail":"<specific observation spanning files>","type":"positive|negative|neutral|warning"}],
  "conclusion": "<3-4 sentence synthesis conclusion with key cross-file takeaways>"
}
Provide 2-4 common themes, 2-3 differences, and 3-5 cross-file insights.`;
}
