export function flattenObject(obj, prefix = "", result = {}) {
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) flattenObject(val, newKey, result);
    else result[newKey] = Array.isArray(val) ? JSON.stringify(val) : val;
  }
  return result;
}

export function parseJSON(buffer) {
  const raw = JSON.parse(buffer.toString("utf-8"));
  let rows = [], columns = [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
    rows = raw.map(r => typeof r === "object" ? r : { value: r });
    columns = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    const f = flattenObject(raw); rows = [f]; columns = Object.keys(f);
  } else {
    rows = [{ value: JSON.stringify(raw) }]; columns = ["value"];
  }
  return { rows, columns, sheetName: "JSON", totalRows: rows.length, fileType: "json",
    isTabular: rows.length > 1 && columns.length > 1, rawText: JSON.stringify(raw, null, 2).slice(0, 8000) };
}

export function parseText(buffer) {
  const text = buffer.toString("utf-8");
  const lines = text.split("\n").filter(l => l.trim());
  return { rows: lines.map((l, i) => ({ line: i + 1, content: l.trim() })), columns: ["line","content"],
    sheetName: "Text", totalRows: lines.length, fileType: "text", isTabular: false, rawText: text.slice(0, 8000) };
}
