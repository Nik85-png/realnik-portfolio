# realnik.co.uk — Nikunj Prajapati's portfolio

Personal portfolio of Nikunj Prajapati (MSc Data Analytics, London Met):
heart-failure machine-learning research (HF-RISK) and an interactive
behavioural card-sorting study (Card Lab). Built with
[Astro 5](https://astro.build), no framework runtime on the client —
static pages plus small progressive-enhancement scripts.

Live site: <https://realnik.co.uk> (served from Heroku; see Deploy below).

## Pages

| Route | What it is |
|---|---|
| `/` | Homepage: hero, stat strip, achievements, featured work, FAQ, contact form |
| `/projects/` | Project index |
| `/info/` | About · CV, timeline, skills, contact form |
| `/cards-analysis/` | Card Lab case study + live 8×8 card-sorting explorer (845 trials, 714 usable) |
| `/hf-risk/` | HF-RISK case study: leakage-audited heart-failure outcome prediction (2,008 Zhang/PhysioNet patients, 0.710 AUROC at 6 months) plus the Oct 2026 patient-grouped MIMIC-IV retrain testing Glasgow Coma Scale components |
| `/hf-risk/tool/` | Embedded research prototype: the retrained 34-vs-37-feature model pair evaluated entirely in the browser, with holdout calibration and per-component GCS attribution |

Research prototype, not a clinical device — every project page says so next
to the numbers, not in a footnote.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # astro build + data minify → dist/
npm run preview  # serve the production build locally
```

## Verify

```bash
npm test                          # smoke suite (routes, assets, contact-API guards)
node scripts/verify-web-model.mjs # re-checks the in-browser model against XGBoost
node scripts/check-live.mjs       # checks the deployed site (needs it to be up)
```

## Deploy

Heroku (`realnik-co-uk`, Eco dynos). `server.mjs` serves `dist/` and runs
`POST /api/contact` (contact form → Resend → inbox, with validation,
honeypot and rate limiting). Any push to the `heroku` remote redeploys:

```bash
git push heroku main
```

Required config vars on the app: `RESEND_API_KEY`, `RESEND_EMAIL_TO`,
`RESEND_EMAIL_FROM`. Locally these live in `.env` (gitignored — never commit it).

## Layout

```
src/pages/        # routes (Astro)
src/components/   # Layout, Nav, Footer, ProjectShowcase, …
src/scripts/      # client scripts (theme, reveal, count-up, hf-risk-model, …)
src/styles/       # global.css, fonts.css
public/           # static assets: hf-risk charts, Card Lab data, CV pdf, fonts
scripts/          # node checks: smoke-test, verify-web-model, check-live, …
server.mjs        # production server (static + /api/contact)
lib/contact-core.mjs  # contact endpoint logic (shared with Netlify function)
```
