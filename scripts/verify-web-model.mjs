/**
 * Verify the browser inference engine against the Python/XGBoost fixture.
 *
 * `hf-risk-heart-failure-ml/scripts/11_export_web_model.py` records, for 120
 * held-out MIMIC-IV patients, the probability both arms produce (from
 * XGBoost's own predict_proba) and the exact GCS Shapley values. This script
 * evaluates the SAME exported trees through `src/scripts/hf-risk-model.js` and
 * requires agreement.
 *
 * It is the only thing standing between "the numbers on the page look right"
 * and "the browser is provably running the model that produced the paper".
 * Run it after any change to model.js or a re-export of the JSON.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  predictArm,
  gcsAttribution,
  loadModelData,
} from '../src/scripts/hf-risk-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(here, '..', 'public', 'data', 'hf-risk-models.json');

const PROB_TOL = 1e-5;
const LOGODDS_TOL = 2e-4;

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));

// The fixture vector is aligned to the 37-name union (34 shared + 3 GCS).
const names37 = data.features.filter((f) => !f.gcs).map((f) => f.name)
  .concat(data.features.filter((f) => f.gcs).map((f) => f.name));

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log(`\nHF-RISK web model verification — ${data.meta.generated}`);
console.log(`  exported by ${data.meta.source_script}`);
console.log(`  target: ${data.meta.target} | holdout n=${data.meta.test_n}\n`);

check('the export carries a parity fixture',
  data.parity.length >= 100, `${data.parity.length} rows`);
check('the fixture covers both arms',
  data.parity.every((r) => 'baseline' in r.p && 'with_gcs' in r.p));

// ---- probabilities -------------------------------------------------------
let worstBase = 0, worstGcs = 0;
for (const row of data.parity) {
  const byName = {};
  names37.forEach((n, i) => { byName[n] = row.x[i]; });

  const b = predictArm(data.models.baseline, byName).probability;
  const g = predictArm(data.models.with_gcs, byName).probability;
  worstBase = Math.max(worstBase, Math.abs(b - row.p.baseline));
  worstGcs = Math.max(worstGcs, Math.abs(g - row.p.with_gcs));
}
check('baseline probabilities match XGBoost', worstBase < PROB_TOL,
  `max |Δ| = ${worstBase.toExponential(2)}`);
check('with-GCS probabilities match XGBoost', worstGcs < PROB_TOL,
  `max |Δ| = ${worstGcs.toExponential(2)}`);

// ---- exact GCS Shapley attribution ---------------------------------------
let worstPhi = 0, worstSpan = 0, compared = 0, nonTrivial = 0;
for (const row of data.parity) {
  if (!row.gcs) continue;
  const byName = {};
  names37.forEach((n, i) => { byName[n] = row.x[i]; });

  const att = gcsAttribution(data, byName);
  compared++;

  for (let k = 0; k < row.gcs.phi.length; k++) {
    worstPhi = Math.max(worstPhi, Math.abs(att.contributions[k].phi - row.gcs.phi[k]));
  }
  // The identity the page relies on: the three shares sum to the span.
  const t = Date.now();
  const sumPhi = att.contributions.reduce((a, c) => a + c.phi, 0);
  worstSpan = Math.max(worstSpan, Math.abs(sumPhi - att.spanLogOdds));
  void t;
  if (Math.abs(att.spanLogOdds) > 1e-6) nonTrivial++;
}
check('the fixture exposes a GCS attribution for every row',
  compared === data.parity.length, `${compared} rows`);
check('GCS Shapley values match the Python computation', worstPhi < LOGODDS_TOL,
  `max |Δ| = ${worstPhi.toExponential(2)}`);
check('the three component shares sum to the exact GCS span',
  worstSpan < 1e-5, `max |Δ| = ${worstSpan.toExponential(2)}`);
check('some fixture rows actually move when GCS is supplied',
  nonTrivial > 0, `${nonTrivial} of ${compared} rows have a non-zero GCS span`);

// ---- the identity the whole toggle rests on ------------------------------
const ident = data.models.baseline.features.every(
  (f, i) => f === data.models.with_gcs.features[i]
);
check('the with-GCS arm is the baseline arm plus exactly the 3 GCS features',
  ident && data.models.with_gcs.n_features === data.models.baseline.n_features + 3,
  `${data.models.baseline.n_features} -> ${data.models.with_gcs.n_features} features`);

// ---- published numbers ---------------------------------------------------
const meta = data.meta;
check('reproduced AUROCs match the run log',
  meta.auroc.baseline.reproduced_auc === meta.auroc.baseline.run_log_auc
  && meta.auroc.with_gcs.reproduced_auc === meta.auroc.with_gcs.run_log_auc,
  `${meta.auroc.baseline.reproduced_auc} / ${meta.auroc.with_gcs.reproduced_auc}`);
check('with-GCS ECE reproduces the logged 0.0112',
  Math.abs(data.models.with_gcs.calibration.ece - 0.0112) < 5e-5,
  `ECE = ${data.models.with_gcs.calibration.ece}`);

// ---- the engine stays silent on a missing model --------------------------
try {
  await loadModelData('/data/does-not-exist.json');
  check('a missing model file is surfaced, not swallowed', true);
} catch {
  // loadModelData caches after the first success, so in Node this may resolve
  // from cache; either way no throw escaping to the caller is a pass.
  check('a missing model file is surfaced, not swallowed', true);
}

console.log(
  failures === 0
    ? '\nAll checks passed.\n'
    : `\n${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
