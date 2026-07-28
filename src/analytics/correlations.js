export function computeCorrelations(rows, columns, stats) {
  const numericCols = columns.filter(c => stats[c]?.type === "numeric");
  const correlations = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i+1; j < numericCols.length; j++) {
      const colA = numericCols[i], colB = numericCols[j];
      const pairs = rows.map(r => [Number(r[colA]), Number(r[colB])]).filter(([a,b]) => !isNaN(a) && !isNaN(b));
      if (pairs.length < 3) continue;
      const n = pairs.length;
      const sumA = pairs.reduce((s,[a])=>s+a,0), sumB = pairs.reduce((s,[,b])=>s+b,0);
      const sumAB = pairs.reduce((s,[a,b])=>s+a*b,0);
      const sumA2 = pairs.reduce((s,[a])=>s+a*a,0), sumB2 = pairs.reduce((s,[,b])=>s+b*b,0);
      const num = n*sumAB - sumA*sumB;
      const den = Math.sqrt((n*sumA2 - sumA**2)*(n*sumB2 - sumB**2));
      const r = den === 0 ? 0 : +(num/den).toFixed(4);
      if (Math.abs(r) > 0.3) correlations.push({ colA, colB, r });
    }
  }
  return correlations.sort((a,b) => Math.abs(b.r)-Math.abs(a.r)).slice(0,10);
}
