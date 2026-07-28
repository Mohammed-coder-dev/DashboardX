export function computeStats(rows, columns) {
  const stats = {};
  for (const col of columns) {
    if (col === "line") continue;
    const values  = rows.map(r => r[col]).filter(v => v !== null && v !== "" && v !== undefined);
    const numeric = values.map(Number).filter(v => !isNaN(v));
    if (numeric.length > 0 && numeric.length >= values.length * 0.5) {
      const sorted = [...numeric].sort((a, b) => a - b);
      const sum = numeric.reduce((a, b) => a + b, 0);
      const mean = sum / numeric.length;
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2
        : sorted[Math.floor(sorted.length/2)];
      const variance = numeric.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numeric.length;
      stats[col] = { type:"numeric", count:numeric.length, mean:+mean.toFixed(4), median:+median.toFixed(4),
        min:sorted[0], max:sorted[sorted.length-1], std:+Math.sqrt(variance).toFixed(4) };
    } else {
      const unique = [...new Set(values.map(String))];
      stats[col] = { type:"categorical", count:values.length, unique:unique.length, top:unique.slice(0,5) };
    }
  }
  return stats;
}
