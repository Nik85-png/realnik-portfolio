// Mirror app.js buildAnalysisData filtering to compute ground-truth stats
const d = require('../public/data/card_analysis_data.json');

const isBlank = (c) => !c ? false : (c.is_blank === true || String(c.value || '').toUpperCase() === 'BLANK');
const numeric = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : (Number(v) || 0);
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

const map = new Map();
validAll.forEach(t => map.set(trialKey(t), t));
const valid = Array.from(map.values());

const success = valid.filter(t => t.outcome === 'success');
const withBlank = valid.filter(t => (t.blank_card_count||0) > 0);
const withoutBlank = valid.filter(t => (t.blank_card_count||0) === 0);

console.log("=== VALID (deduped, move_count>=6, moves>0) ===");
console.log("total:", valid.length);
console.log("success_count:", success.length);
console.log("success_rate %:", (success.length/valid.length*100).toFixed(2));
console.log("with_blank count:", withBlank.length);
console.log("without_blank count:", withoutBlank.length);
console.log("blank_success_rate %:", (withBlank.filter(t=>t.outcome==='success').length/withBlank.length*100).toFixed(2));
console.log("no_blank_success_rate %:", (withoutBlank.filter(t=>t.outcome==='success').length/withoutBlank.length*100).toFixed(2));
console.log("trials_with_blank_cards:", withBlank.length);

console.log("\n=== NONEMPTY RAW (moves>0 only, no move_count filter, no dedupe) ===");
console.log("count:", nonEmptyRaw.length);
const s2 = nonEmptyRaw.filter(t=>t.outcome==='success');
console.log("success:", s2.length, "rate%:", (s2.length/nonEmptyRaw.length*100).toFixed(2));

console.log("\n=== RAW analysis_types trials total ===");
console.log("count:", allRaw.length);
console.log("success:", allRaw.filter(t=>t.outcome==='success').length);

console.log("\n=== data.statistics block ===");
console.log(JSON.stringify(d.statistics));
