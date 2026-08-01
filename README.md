# PSC Overtime Request System

Fills your Puyat Steel "Overtime Request Form" from your local git commit
history, overlaid directly onto a scan of the actual form, and exports a
print-ready PDF.

**Stack:** Node/Express (API + Puppeteer PDF rendering) + Vue 3/Vite (review UI).
Reads commits with plain `git log` on your local repos — no GitHub API/token
needed since your repo lives at `C:\xampp\htdocs\psc-enterprise-system`.

## How it works

1. You pick a cutoff period (6th–20th, or 21st–5th of next month).
2. The server runs `git log` on every repo listed in `server/config.js`
   for that date range, one entry per commit.
3. The Vue UI groups commits by day (one row per day) and pre-fills the
   "Reason(s)" column from your commit messages and "Time" from the
   first/last commit of that day.
4. **You manually enter "No. of Hours"** per day (per your earlier answer —
   commit timestamps alone aren't a reliable proxy for hours worked).
5. Click "Generate & Print PDF" — the server produces a **blank PDF with
   only your data**, positioned to line up with the physical form
   (`server/config.js` → `FIELD_POSITIONS`, in percentages of the page).
   You feed your pre-printed Overtime Request forms through the printer and
   the data lands in the right spots.
6. The form has **17 rows** per sheet. If a cutoff period has commits on
   more than 17 distinct days, the PDF automatically **spans multiple
   pages** — one page per 17 rows — so you just feed that many blank forms
   into the printer. Totals and the "Requested by" line only print on the
   last page; "Date Filed" repeats on every page since each page is a
   separate physical sheet.

## Setup

```bash
cd server
npm install
npm run dev        # starts API on http://localhost:4000

# in a second terminal
cd client
npm install
npm run dev         # starts UI on http://localhost:5173
```

Open http://localhost:5173.

> Puppeteer downloads a bundled Chromium on `npm install` — first install may
> take a minute and needs internet access.

## Configuring repos

Two ways:
- **UI:** "Repos" tab → add name / path / optional author filter. This
  rewrites `server/config.js` for you.
- **Manually:** edit `server/config.js` → `REPOS` array:

```js
const REPOS = [
  { name: 'psc-enterprise-system', path: 'C:\\xampp\\htdocs\\psc-enterprise-system', author: '' },
  { name: 'another-project', path: 'C:\\xampp\\htdocs\\another-project', author: '' }
];
```

`author` is optional — filters `git log --author=`. Leave blank to include
every author's commits in that repo (useful if you're the only committer).

## Calibrating field positions

The generated PDF is blank on purpose — it's meant to be printed directly
onto your physical pre-printed forms, so positions need to match your paper.
The scan you sent (`server/assets/form.jpg`) is bundled purely as an on-screen
reference for the **Calibrate** tab; it is never printed.

1. First set `PAGE_WIDTH_IN` / `PAGE_HEIGHT_IN` in `server/config.js` to
   match your actual paper (default: Letter 8.5x11").
2. Go to the **Calibrate** tab in the UI, click on the reference image where
   a field should sit (e.g. right on the first table row's "Date" column,
   or the "Date Filed" line).
3. It shows `x%, y%` — copy that value into `server/config.js` under the
   matching field. Percentages work regardless of paper size, as long as the
   reference image and your physical form have the same aspect ratio.
4. For the table, only `tableTop` (first row's y%) and `rowHeight` (spacing
   between rows) need adjusting — all 17 rows use the same column x%
   values and are evenly spaced from there.
5. Do a test print on plain paper, hold it over an actual blank form up to
   the light (or against a window) to check alignment, then adjust.

Re-generate a PDF after each tweak to check alignment.

## Notes / things you'll likely want to adjust

- **Sun/Hol detection** is automatic (Sunday = checked) but doesn't know
  Philippine holidays — the checkbox in the review table is editable per row.
- **Sun/Hol Excess** has no automatic source and is a plain manual input.
- More than 17 days of commits in one cutoff period → the PDF spans
  multiple pages automatically (see "How it works" above); no data is
  dropped.
- `REQUESTOR_NAME` in `config.js` is the default for "Requested by" — also
  editable per-generation in the UI.
- Reason(s) text is just the commit message(s) for that day, joined with
  `; ` — no repo name prefix, even when you have multiple repos configured.
