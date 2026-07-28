const insight = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "type"],
  properties: {
    title:  { type: "string" },
    detail: { type: "string" },
    type:   { type: "string", enum: ["positive", "negative", "neutral", "warning"] },
  },
};

const variable = {
  type: "object",
  additionalProperties: false,
  required: ["name", "explanation", "notable"],
  properties: {
    name:        { type: "string" },
    explanation: { type: "string" },
    notable:     { type: "string" },
  },
};

const chart = {
  type: "object",
  additionalProperties: false,
  required: ["type", "title", "x", "y", "reason"],
  properties: {
    type:   { type: "string", enum: ["bar", "line", "scatter", "pie"] },
    title:  { type: "string" },
    x:      { type: "string" },
    y:      { anyOf: [{ type: "string" }, { type: "null" }] },
    reason: { type: "string" },
  },
};

const topic = {
  type: "object",
  additionalProperties: false,
  required: ["name", "summary", "importance"],
  properties: {
    name:       { type: "string" },
    summary:    { type: "string" },
    importance: { type: "string", enum: ["high", "medium", "low"] },
  },
};

// Shared by tabular and document analyses: tabular fills charts and leaves
// topics empty, document analyses do the reverse.
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "insights", "variables", "charts", "topics", "conclusion"],
  properties: {
    summary:    { type: "string" },
    insights:   { type: "array", items: insight },
    variables:  { type: "array", items: variable },
    charts:     { type: "array", items: chart },
    topics:     { type: "array", items: topic },
    conclusion: { type: "string" },
  },
};

export const CROSS_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "commonThemes", "differences", "insights", "conclusion"],
  properties: {
    summary: { type: "string" },
    commonThemes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme", "detail"],
        properties: { theme: { type: "string" }, detail: { type: "string" } },
      },
    },
    differences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["aspect", "detail"],
        properties: { aspect: { type: "string" }, detail: { type: "string" } },
      },
    },
    insights:   { type: "array", items: insight },
    conclusion: { type: "string" },
  },
};
