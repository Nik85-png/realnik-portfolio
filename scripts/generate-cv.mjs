// Generates public/cv/nikunj-prajapati-cv.pdf
// Run: node scripts/generate-cv.mjs
import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/cv/nikunj-prajapati-cv.pdf');

const INK = '#111416';
const MUTED = '#5a6066';
const TEAL = '#0f766e';
const RULE = '#d8d4cc';

const doc = new PDFDocument({ size: 'A4', margin: 0 });
const stream = createWriteStream(OUT);
doc.pipe(stream);

const W = doc.page.width;
const H = doc.page.height;
const ML = 52; // left margin
const MR = 52; // right margin
const CW = W - ML - MR; // content width

let y = 0;

function need(space) {
  if (y + space > H - 56) {
    doc.addPage();
    y = 56;
  }
}

function text(str, x, yy, opts = {}) {
  doc.font(opts.font || 'Helvetica')
    .fontSize(opts.size || 9.5)
    .fillColor(opts.color || INK);
  if (opts.italic) doc.font('Helvetica-Oblique');
  doc.text(str, x, yy, { width: opts.width, align: opts.align || 'left', lineGap: opts.lineGap ?? 2 });
  return doc.y;
}

function rule(yy, color = RULE, width = 0.7) {
  doc.moveTo(ML, yy).lineTo(W - MR, yy).stroke(color).lineWidth(width);
}

function section(title) {
  need(56);
  y += 22;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEAL);
  doc.text(title.toUpperCase(), ML, y, { letterSpacing: 1.6, width: CW });
  y += 8;
  rule(y);
  y += 10;
}

function entry(date, title, org, bullets = []) {
  need(40 + bullets.length * 13);
  // date on the right
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  const dw = doc.widthOfString(date);
  doc.text(date, W - MR - dw, y + 1);
  // title + org
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text(title, ML, y, { width: CW - dw - 12, continued: false });
  y = doc.y;
  if (org) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED);
    doc.text(org, ML, y, { width: CW });
    y = doc.y;
  }
  y += 3;
  bullets.forEach((b) => {
    need(14);
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    doc.text(`•  ${b}`, ML + 8, y, { width: CW - 8, lineGap: 1.5 });
    y = doc.y + 2;
  });
  y += 4;
}

// ================= HEADER =================
y = 64;
doc.font('Helvetica-Bold').fontSize(26).fillColor(INK);
doc.text('Nikunj Prajapati', ML, y, { width: CW });
y = doc.y + 2;

doc.font('Helvetica').fontSize(11).fillColor(TEAL);
doc.text('Data Analytics  ·  MSc Data Analytics (London Metropolitan University)', ML, y, { width: CW });
y = doc.y + 6;

doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
doc.text(
  'prajapatinick85@gmail.com   ·   London, UK   ·   github.com/Nik85-png   ·   linkedin.com/in/nikunj-prajapati-b8a3b7232',
  ML,
  y,
  { width: CW }
);
y = doc.y + 8;
rule(y, INK, 1.2);

// ================= PROFILE =================
section('Profile');
need(60);
doc.font('Helvetica').fontSize(9.5).fillColor(INK);
doc.text(
  'MSc Data Analytics (London Metropolitan University, July 2026) moving from mathematics and education into clinical and behavioural analytics. Dissertation work on leakage-audited heart-failure outcome prediction (2,008 patients, 143 predictors) plus a patient-grouped MIMIC-IV retrain showing GCS components add +0.0138 AUROC at 28 days, and an 845-trial behavioural card-sorting analysis with an interactive viewer. Day-to-day experience in care-record compliance, log validation and audit readiness. Available now for graduate data-analytics roles in London.',
  ML,
  y,
  { width: CW, lineGap: 3, align: 'justify' }
);
y = doc.y;

// ================= EDUCATION =================
section('Education');
entry('Sep 2025 – Jul 2026', 'MSc Data Analytics (completed July 2026)', 'London Metropolitan University', [
  'Dissertation: HF-RISK — predicting heart-failure outcomes with machine learning, with a full leakage audit and a patient-grouped MIMIC-IV extension.',
  'Modules: statistical modelling, predictive analytics, data visualisation, databases.',
]);
entry('Jun 2021', 'B.Sc. Mathematics', 'Gujarat University', []);
entry('Apr 2023', 'Bachelor of Education', 'Gujarat University', []);

// ================= EXPERIENCE =================
section('Experience');
entry('Apr 2026 – present', 'Customer Service Manager', 'Ladbrokes / Entain, Harrow', [
  'Lead the service floor: shift rota, complaint resolution and coaching to brand service standards.',
  'Escalation point for complex customer cases; weekly performance reporting to management.',
]);
entry('Nov 2025 – May 2026', 'AI Response Evaluator', 'TMX China', [
  'Scored and calibrated AI-generated responses against rubric quality bars at volume.',
  'Systematised recurring failure patterns and fed them back to the model team.',
]);
entry('Oct 2025 – present', 'Card-Sorting Analysis Intern (under Dr. Subeksha Shrestha, Module Leader)', 'London Metropolitan University', [
  'Cleaned and analysed 845 recorded trials of spatial card sorting (714 usable after validation).',
  'Built an interactive analysis viewer: nine views including retry tracing, progression and recovery.',
]);
entry('May 2025 – Apr 2026', 'Administration', 'PHC Home Care', [
  'Care records: accurate, timely, audit-ready documentation across daily logs.',
  'Log validation, incident tracking and audit readiness; evidence packs for inspections.',
  'Built the website for a secondary company (chi ezahomecare.co.uk).',
]);
entry('Aug 2025', 'Community Volunteer', 'Metropolitan Police', [
  'Safer Neighbourhoods volunteering: community engagement and local safety outreach in London.',
]);

// ================= PROJECTS =================
section('Selected Projects');
entry('Feb – Mar 2025',  'HF-RISK — Predicting Heart Failure Outcomes with Machine Learning',
  'MSc Dissertation + 2026 extension',
  [
    '2,008 Zhang/PhysioNet heart-failure records; 143 final predictors after a full leakage audit.',
    'Five models, four horizons: Random Forest 0.781 (28-day) and 0.839 (3-month); XGBoost 0.710 (6-month mortality) and 0.650 (6-month readmission).',
    'Leakage audit cut the headline 6-month AUROC from 0.819 to 0.710 by removing discharge-day and outcome-proxy features.',
    'Direct transfer to MIMIC-IV (42,990 admissions): 0.599 at six months — a transportability check, not a clinical claim.',
    '2026 extension: patient-grouped retrain inside MIMIC-IV (18,890 patients) — GCS components add +0.0138 AUROC at 28 days and +0.0086 at six months, and still +0.0104 on top of an independent ICU-stay control.',
    'GCS left missing where it was never charted (72% of admissions) rather than imputed as a normal score; SHAP maps a cardiorenal axis.',
  ]
);
entry('Oct 2025 – present', 'Interactive Card Sorting — Spatial Organization & Cognitive Strategy', 'Behavioural Analysis', [
  '845 recorded trials (714 usable) of arranging KQJ blank cards on an 8×8 board.',
  'Finding: organisation beats raw effort; blank cards act as scaffolding; recovery is uncommon but informative.',
  'Vanilla JavaScript + Plotly interactive viewer with nine analysis modes and a trial picker.',
]);

// ================= SKILLS =================
section('Skills');
need(90);
doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
doc.text('Languages & libraries', ML, y, { width: CW });
y = doc.y + 2;
doc.font('Helvetica').fontSize(9).fillColor(INK);
doc.text('Python (pandas, NumPy, scikit-learn, SHAP, Plotly, Streamlit, lifelines)  ·  R (survival, ggplot2, dplyr)  ·  SQL  ·  JavaScript', ML, y, { width: CW, lineGap: 2 });
y = doc.y + 8;
doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
doc.text('Methods & tools', ML, y, { width: CW });
y = doc.y + 2;
doc.font('Helvetica').fontSize(9).fillColor(INK);
doc.text('Statistical modelling  ·  Predictive analytics  ·  Data cleaning  ·  Feature engineering  ·  Data visualisation  ·  Power BI  ·  Behavioural analysis  ·  Compliance-aware data handling', ML, y, { width: CW, lineGap: 2 });
y = doc.y;

// ================= INTERESTS =================
section('Interests');
need(40);
doc.font('Helvetica').fontSize(9.5).fillColor(INK);
doc.text('Ancient history (especially Egypt)  ·  Fitness & running  ·  Self-development  ·  Continuous learning', ML, y, { width: CW, lineGap: 2 });
y = doc.y;

// ================= FOOTER =================
need(40);
y += 14;
rule(y, RULE, 0.7);
y += 10;
doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
doc.text(
  'Nikunj Prajapati — CV · Available now for graduate data-analytics roles in London · References on request',
  ML,
  y,
  { width: CW }
);

doc.end();

stream.on('finish', () => {
  console.log('CV written to', OUT);
});

mkdirSync(dirname(OUT), { recursive: true });
