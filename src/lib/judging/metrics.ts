// Agreement between the AI rubric and human labels (the gold set). Pure.

/** Average ranks, 1-based, ties sharing the mean of their positions. */
export function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const avg = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) out[order[t].i] = avg;
    k = j + 1;
  }
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

/** Spearman's rank correlation (Pearson on average ranks, so ties are handled). Null when undefined. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length) throw new Error("spearman: lengths differ");
  return pearson(ranks(a), ranks(b));
}

export type Agreement = { n: number; mae: number; withinOne: number; spearman: number | null };

export function agreement(human: number[], model: number[]): Agreement {
  if (human.length !== model.length) throw new Error("agreement: lengths differ");
  const n = human.length;
  const diffs = human.map((h, i) => Math.abs(h - model[i]));
  return {
    n,
    mae: n ? diffs.reduce((s, d) => s + d, 0) / n : 0,
    withinOne: n ? diffs.filter((d) => d <= 1).length / n : 0,
    spearman: spearman(human, model),
  };
}

/** The pass bar: at least 80% within one point and Spearman of 0.7 or more. */
export function passes(a: Agreement, bar = { withinOne: 0.8, spearman: 0.7 }): boolean {
  return a.withinOne >= bar.withinOne && a.spearman !== null && a.spearman >= bar.spearman;
}
