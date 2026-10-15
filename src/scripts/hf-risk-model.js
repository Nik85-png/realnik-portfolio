/**
 * HF-RISK in-browser inference.
 *
 * The tool used to be a Flask service on Render, which cold-started and showed
 * "unreachable" whenever the dyno had been idle. This module evaluates the
 * exported XGBoost ensembles directly in the browser, so the page cannot fail
 * for a hosting reason and no input ever leaves the visitor's machine.
 *
 * The arithmetic has to match XGBoost exactly, and two details decide that:
 *
 *   1. XGBoost stores features and split thresholds as float32 and compares
 *      them in float32. Comparing the float64 value from a number input
 *      against the float32 threshold takes the wrong branch whenever a
 *      threshold is exactly representable and the value sits on it (e.g.
 *      creatinine 1.2 against a split at float32(1.2) = 1.20000005). Both
 *      sides are therefore rounded with Math.fround before comparing.
 *   2. Leaf values are accumulated in float32, because that is what XGBoost's
 *      CPU predictor does. Accumulating in double leaves a ~4e-06 wobble.
 *
 * `scripts/verify-web-model.mjs` re-evaluates the fixture rows exported by
 * `11_export_web_model.py` and requires agreement to 1e-05 in probability.
 * If this file is ever refactored, that check is what says whether it is
 * still the same model.
 */

/** Round to float32, the precision XGBoost itself works in. */
const f32 = Math.fround;

/** Sum the leaf values a vector lands on, then add the model's offset. */
export function margin(model, vec) {
  const trees = model.trees;
  let total = 0;
  for (let t = 0; t < trees.length; t++) {
    const tr = trees[t];
    const f = tr.f, v = tr.v, l = tr.l, r = tr.r, d = tr.d, w = tr.w;
    let i = 0;
    while (f[i] !== -1) {
      const val = vec[f[i]];
      if (val !== val) {
        // NaN: the feature was never measured, so take the trained default
        // branch rather than inventing a value.
        i = d[i] ? l[i] : r[i];
      } else if (f32(val) < f32(v[i])) {
        i = l[i];
      } else {
        i = r[i];
      }
    }
    total = f32(total + f32(w[i]));
  }
  return f32(total + f32(model.intercept));
}

/** Logistic link: raw margin (log-odds) -> probability. */
export function probability(z) {
  return 1 / (1 + Math.exp(-z));
}

/** Convert log-odds to an odds multiplier, for plain-language framing. */
export function oddsMultiplier(z) {
  return Math.exp(z);
}

function toVector(model, byName) {
  return model.features.map((name) => {
    const v = byName[name];
    if (v === null || v === undefined || v === '') return NaN;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? NaN : n;
  });
}

/**
 * Probability for one arm ('baseline' | 'with_gcs').
 * `byName` maps feature name -> number, or null/'' for "not assessed".
 */
export function predictArm(model, byName) {
  const z = margin(model, toVector(model, byName));
  return { margin: z, probability: probability(z) };
}

export function predictBoth(data, byName) {
  const base = predictArm(data.models.baseline, byName);
  const gcs = predictArm(data.models.with_gcs, byName);
  return {
    baseline: base,
    with_gcs: gcs,
    deltaPoints: (gcs.probability - base.probability) * 100,
    deltaLogOdds: gcs.margin - base.margin,
  };
}

/** Which of the three GCS components are actually present in `byName`. */
export function gcsPresence(data, byName) {
  const names = data.features.filter((f) => f.gcs).map((f) => f.name);
  const out = {};
  for (const n of names) {
    const v = byName[n];
    out[n] = !(v === null || v === undefined || v === '' || Number.isNaN(v));
  }
  out.all = names.every((n) => out[n]);
  out.any = names.some((n) => out[n]);
  out.names = names;
  return out;
}

/**
 * Exact Shapley values for the three GCS components inside the with-GCS model.
 *
 * With three features there are only 3! = 6 orderings, so the Shapley value is
 * computed exactly by averaging marginal contributions over every ordering --
 * no sampling and no approximation. The value function treats a component
 * outside the subset as *not assessed* (NaN), which is the model's trained
 * missing branch, so the three values sum precisely to
 * [margin with GCS known] - [margin with GCS unknown].
 *
 * This is an attribution of the GCS block within this model, holding the other
 * 34 inputs at the patient's values. It is deliberately NOT presented as a
 * full-model SHAP explanation.
 */
export function gcsAttribution(data, byName) {
  const model = data.models.with_gcs;
  const names = data.features.filter((f) => f.gcs).map((f) => f.name);
  const idx = names.map((n) => model.features.indexOf(n));
  const base = toVector(model, byName);

  const valueOf = (subset) => {
    const vec = base.slice();
    for (const j of idx) if (!subset.includes(j)) vec[j] = NaN;
    return margin(model, vec);
  };

  const empty = valueOf([]);
  const phi = new Map(idx.map((j) => [j, 0]));

  // 3! orderings of the three GCS indices.
  const perms = permutations(idx);
  for (const perm of perms) {
    const seen = [];
    let prev = empty;
    for (const j of perm) {
      seen.push(j);
      const cur = valueOf(seen);
      phi.set(j, phi.get(j) + (cur - prev) / perms.length);
      prev = cur;
    }
  }

  const known = valueOf(idx);
  return {
    names,
    contributions: names.map((n, k) => ({
      name: n,
      index: idx[k],
      phi: phi.get(idx[k]),
      present: !Number.isNaN(base[idx[k]]),
      value: base[idx[k]],
    })),
    unknownMargin: empty,
    knownMargin: known,
    spanLogOdds: known - empty,
    spanPoints: (probability(known) - probability(empty)) * 100,
  };
}

/**
 * Margin with the whole GCS block set to "not assessed", inside the with-GCS
 * model. Comparing this with the known state isolates the GCS block from the
 * extra difference between the two separately-trained models.
 */
export function gcsUnknownBaseline(data, byName) {
  const model = data.models.with_gcs;
  const base = toVector(model, byName);
  for (const f of data.features) {
    if (f.gcs) base[model.features.indexOf(f.name)] = NaN;
  }
  const z = margin(model, base);
  return { margin: z, probability: probability(z) };
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

/**
 * Percentile of a predicted risk within the holdout distribution, read from
 * the exported quantiles. Returns e.g. 82 for "above about 82% of the
 * derivation-cohort holdout". Interpolated between the exported quantiles.
 */
export function riskPercentile(dist, p) {
  const q = dist.quantiles;
  const points = [
    [0, 0], [q.p05, 5], [q.p25, 25], [q.p50, 50],
    [q.p75, 75], [q.p90, 90], [q.p95, 95], [dist.max, 99],
  ];
  if (p <= 0) return 0;
  if (p >= dist.max) return 99;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (p <= x1) {
      const t = x1 === x0 ? 0 : (p - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 99;
}

/** Load the exported model once and cache it for the page's lifetime. */
let cached = null;
export async function loadModelData(url = '/data/hf-risk-models.json') {
  if (cached) return cached;
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`model fetch failed: ${res.status}`);
  cached = await res.json();
  return cached;
}
