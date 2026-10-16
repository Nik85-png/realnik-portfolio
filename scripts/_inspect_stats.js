// Mirror app.js buildAnalysisData filtering to compute ground-truth stats
const d = require('./public/data/card_analysis_data.json');

const isBlank = (c) => !c ? false : (c.is_blank === true || String(c.value || '').toUpperCase() === 'BLANK');
const numeric = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : (Number(v) || 0);
const avg = (a) => a.length ? a.reduce((s,v)=>s+numeric(v),0)/a.length : 0;
const trialKey = (t) => [
  t.participant||'', t.condition||'', t.outcome||'',
  numeric(t.move_count ?? (t.moves||[]).length),
  Number(numeric(t.messiness_score).toFixed(4))
].join('|');

const MIN_VALID_MOVES = 6;

const rawAnalyses = d.analysis_types || [];
const allRaw = rawAnalyses.flatMap(a => (a.trials||[]).map(t => {
  const moves = Array.isArray(t.moves) ? t.moves.filter(m => Number.isInteger(m?.row) && Number.isInteger(m?.col)) : [];
  const finalState = Array.isArray(t.final_state) ? t.final_state.filter(m => Number.isInteger(m?.row) && Number.isInteger(m?.col)) : [];
  const blankCardCount = Number(t.blank_card_count || finalState.filter(c=>isBlank(c)).length || 0);
  const moveCount = numeric(t.move_count ?? moves.length);
  return { ...t, moves, final_state: finalState, move_count: moveCount, blank_card_count: blankCardCount };
}));

const nonEmptyRaw = allRaw.filter(t => t.moves.length > 0);
const validAll = nonEmptyRaw.filter(t => t.move_count >= MIN_VALID_MOVES);

// dedupe
const map = new Map();
validAll.forEach(t => map.set(trialKey(t), t));
const valid = Array.from(map.values());

console.log("RAW analysis_types trials total:", allRaw.length);
console.log("nonEmptyRaw (moves>0):", nonEmptyRaw.length);
console.log("validAll (move_count>=6):", validAll.length);
console.log("valid (deduped):", valid.length);

const success = valid.filter(t => t.outcome === 'success');
console.log("--- VALID (deduped) stats ---");
console.log("total:", valid.length);
console.log("success_count:", success.length);
console.log("success_rate:", (success.length/valid.length*100).toFixed(2));

const withBlank = valid.filter(t => (t.blank_card_count||0) > 0);
const withoutBlank = valid.filter(t => (t.blank_card_count||0) === 0);
console.log("with_blank:", withBlank.length);
console.log("without_blank:", withoutBlank.length);
console.log("blank_success_rate:", (withBlank.filter(t=>t.outcome==='success').length/withBlank.length*100).toFixed(2));
console.log("no_blank_success_rate:", (withoutBlank.filter(t=>t.outcome==='success').length/withoutBlank.length*100).toFixed(2));

// Also compute over nonEmptyRaw (714-ish) without dedupe, move_count>=6
console.log("--- nonEmptyRaw move_count>=6 (no dedupe) ---");
const neValid = nonEmptyRaw.filter(t => t.move_count >= MIN_VALID_MOVES);
console.log("count:", neValid.length);
console.log("success:", neValid.filter(t=>t.outcome==='success').length, "rate:", (neValid.filter(t=>t.outcome==='success').length/neValid.length*100).toFixed(2));

// distribution of move_count to understand the 766/714 split
const byOutcome = {};
valid.forEach(t => { const o=t.outcome; byOutcome[o]=(byOutcome[o]||0)+1; });
console.log("outcome distribution (deduped):", JSON.stringify(byOutcome));
