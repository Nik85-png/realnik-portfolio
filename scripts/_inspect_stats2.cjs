const d = require('../public/data/card_analysis_data.json');

const isBlank = (c) => !c ? false : (c.is_blank === true || String(c.value||'').toUpperCase()==='BLANK');
const numeric = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : (Number(v)||0);

// Strong identity key: participant + condition + trial_number + first/last move
function idKey(t){
  const moves = Array.isArray(t.moves)?t.moves.filter(m=>Number.isInteger(m?.row)&&Number.isInteger(m?.col)):[];
  const f = moves[0], l = moves[moves.length-1];
  return [t.participant||'', t.condition||'', Number.isFinite(numeric(t.trial_number))?numeric(t.trial_number):'?',
    f?`${f.row}-${f.col}`:'nf', l?`${l.row}-${l.col}`:'nl', moves.length].join('|');
}

const rawAnalyses = d.analysis_types || [];
const allRaw = rawAnalyses.flatMap(a => (a.trials||[]).map(t => ({ ...t })));
console.log("raw flatMap total:", allRaw.length);

// outcome distribution over allRaw
const outDist = {};
allRaw.forEach(t => { const o=t.outcome||'none'; outDist[o]=(outDist[o]||0)+1; });
console.log("outcome distribution (allRaw):", JSON.stringify(outDist));

// Dedupe by strong key
const m = new Map();
allRaw.forEach(t => { if(!m.has(idKey(t))) m.set(idKey(t), t); });
const uniq = Array.from(m.values());
console.log("\nUNIQUE (strong key):", uniq.length);

const su = uniq.filter(t=>t.outcome==='success');
console.log("success:", su.length, "rate%:", (su.length/uniq.length*100).toFixed(2));
const wb = uniq.filter(t=> (numeric(t.blank_card_count) || (Array.isArray(t.final_state)?t.final_state.filter(isBlank).length:0))>0 );
const nb = uniq.filter(t=> (numeric(t.blank_card_count) || (Array.isArray(t.final_state)?t.final_state.filter(isBlank).length:0))===0 );
console.log("with_blank:", wb.length, "rate%:", (wb.length/uniq.length*100).toFixed(2));
console.log("without_blank:", nb.length);
console.log("blank_success%:", (wb.filter(t=>t.outcome==='success').length/wb.length*100).toFixed(2));
console.log("no_blank_success%:", (nb.filter(t=>t.outcome==='success').length/nb.length*100).toFixed(2));

// Now apply app.js validity filter: moves>0 AND move_count>=6
const mvOk = uniq.filter(t => {
  const moves = Array.isArray(t.moves)?t.moves.filter(m=>Number.isInteger(m?.row)&&Number.isInteger(m?.col)):[];
  return moves.length>0 && numeric(t.move_count ?? moves.length) >= 6;
});
console.log("\nUNIQUE + valid (moves>0, move_count>=6):", mvOk.length);
console.log("valid success:", mvOk.filter(t=>t.outcome==='success').length, "rate%:", (mvOk.filter(t=>t.outcome==='success').length/mvOk.length*100).toFixed(2));
const wbv = mvOk.filter(t=>numeric(t.blank_card_count)>0);
const nbv = mvOk.filter(t=>numeric(t.blank_card_count)===0);
console.log("valid with_blank:", wbv.length, "rate%:", (wbv.length/mvOk.length*100).toFixed(2), "blank_success%:", (wbv.filter(t=>t.outcome==='success').length/wbv.length*100).toFixed(2));
console.log("valid without_blank:", nbv.length, "no_blank_success%:", (nbv.filter(t=>t.outcome==='success').length/nbv.length*100).toFixed(2));

// distribution of move_count among unique
const mc = {};
uniq.forEach(t=>{const k=Math.floor(numeric(t.move_count)/5)*5; mc[k]=(mc[k]||0)+1;});
console.log("\nmove_count hist (unique, bins of 5):", JSON.stringify(mc));
console.log("\ndata.statistics:", JSON.stringify(d.statistics));
