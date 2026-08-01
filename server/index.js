const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getCommitsGroupedByDay } = require('./lib/commits');
const { getCutoffRange, getCutoffDates, currentCutoff, monthName } = require('./lib/cutoff');
const { renderOverTimeFormPDF } = require('./lib/pdf');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG_PATH = path.join(__dirname, 'config.js');

// ---------------------------------------------------------------------------
// GET /api/repos - list configured repos
// ---------------------------------------------------------------------------
app.get('/api/repos', (req, res) => {
  res.json({
    repos: config.REPOS,
    requestorName: config.REQUESTOR_NAME,
    recommendingName: config.RECOMMENDING_NAME,
    approvedName: config.APPROVED_BY_NAME
  });
});

// ---------------------------------------------------------------------------
// POST /api/repos - add a repo { name, path, author }
// Persists to config.js by rewriting the REPOS array (simple text-based edit
// so comments/formatting in config.js are preserved as much as possible).
// ---------------------------------------------------------------------------
app.post('/api/repos', (req, res) => {
  const { name, path: repoPath, author } = req.body;
  if (!name || !repoPath) {
    return res.status(400).json({ error: 'name and path are required' });
  }

  const newRepos = [...config.REPOS, { name, path: repoPath, author: author || '' }];
  writeReposToConfig(newRepos);
  config.REPOS.push({ name, path: repoPath, author: author || '' });

  res.json({ repos: config.REPOS });
});

// ---------------------------------------------------------------------------
// DELETE /api/repos/:name
// ---------------------------------------------------------------------------
app.delete('/api/repos/:name', (req, res) => {
  const idx = config.REPOS.findIndex(r => r.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: 'repo not found' });
  config.REPOS.splice(idx, 1);
  writeReposToConfig(config.REPOS);
  res.json({ repos: config.REPOS });
});

function writeReposToConfig(repos) {
  let src = fs.readFileSync(CONFIG_PATH, 'utf8');
  const block = `const REPOS = ${JSON.stringify(repos, null, 2)};`;
  src = src.replace(/const REPOS = \[[\s\S]*?\];/, block);
  fs.writeFileSync(CONFIG_PATH, src, 'utf8');
}

// ---------------------------------------------------------------------------
// GET /api/field-positions - current FIELD_POSITIONS (for the Layout adjuster)
// ---------------------------------------------------------------------------
app.get('/api/field-positions', (req, res) => {
  res.json({ fieldPositions: config.FIELD_POSITIONS });
});

// ---------------------------------------------------------------------------
// PUT /api/field-positions - body: { fieldPositions }
// Rewrites the FIELD_POSITIONS block in config.js and updates the running
// server in memory. Input is rebuilt from a fixed schema (numbers only) so we
// can never write malformed JS that would break `require('./config')`.
// ---------------------------------------------------------------------------
app.put('/api/field-positions', (req, res) => {
  try {
    const next = sanitizeFieldPositions(req.body.fieldPositions || req.body);
    writeFieldPositionsToConfig(next);
    res.json({ fieldPositions: config.FIELD_POSITIONS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Rebuild the positions object from the known shape, coercing every leaf to a
// finite number and falling back to the current value when something is missing
// or invalid. This is what guards config.js against garbage input.
function sanitizeFieldPositions(fp) {
  const cur = config.FIELD_POSITIONS;
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const point = (p, c) => ({ x: num(p && p.x, c.x), y: num(p && p.y, c.y) });
  const t = (fp && fp.table) || {};
  const cols = t.columns || {};
  const totals = (fp && fp.totals) || {};

  return {
    dateFiled: point(fp && fp.dateFiled, cur.dateFiled),
    table: {
      x: num(t.x, cur.table.x),
      y: num(t.y, cur.table.y),
      width: num(t.width, cur.table.width),
      height: num(t.height, cur.table.height),
      rowCount: Math.max(1, Math.round(num(t.rowCount, cur.table.rowCount))),
      reasonCharsPerLine: Math.max(1, Math.round(num(t.reasonCharsPerLine, cur.table.reasonCharsPerLine))),
      columns: {
        date: num(cols.date, cur.table.columns.date),
        reason: num(cols.reason, cur.table.columns.reason),
        time: num(cols.time, cur.table.columns.time),
        hours: num(cols.hours, cur.table.columns.hours)
      }
    },
    totals: {
      totalRegOT: point(totals.totalRegOT, cur.totals.totalRegOT),
      sunHolOT: point(totals.sunHolOT, cur.totals.sunHolOT),
      sunHolExcess: point(totals.sunHolExcess, cur.totals.sunHolExcess)
    },
    requestedBy: point(fp && fp.requestedBy, cur.requestedBy),
    recommendingApproval: point(fp && fp.recommendingApproval, cur.recommendingApproval),
    approvedBy: point(fp && fp.approvedBy, cur.approvedBy)
  };
}

function writeFieldPositionsToConfig(fp) {
  let src = fs.readFileSync(CONFIG_PATH, 'utf8');
  const block = `const FIELD_POSITIONS = ${JSON.stringify(fp, null, 2)};`;
  if (!/const FIELD_POSITIONS = \{[\s\S]*?\n\};/.test(src)) {
    throw new Error('Could not locate the FIELD_POSITIONS block in config.js');
  }
  src = src.replace(/const FIELD_POSITIONS = \{[\s\S]*?\n\};/, block);
  fs.writeFileSync(CONFIG_PATH, src, 'utf8');

  // Update in place so existing references (e.g. in lib/pdf.js) see the change
  // without a server restart.
  Object.keys(config.FIELD_POSITIONS).forEach(k => delete config.FIELD_POSITIONS[k]);
  Object.assign(config.FIELD_POSITIONS, fp);
}

// ---------------------------------------------------------------------------
// GET /api/cutoff/current - which cutoff period "today" falls in
// ---------------------------------------------------------------------------
app.get('/api/cutoff/current', (req, res) => {
  const c = currentCutoff();
  const range = getCutoffRange(c.year, c.month, c.cutoff);
  res.json({ ...c, ...range });
});

// ---------------------------------------------------------------------------
// GET /api/commits?year=2026&month=7&cutoff=first
// Returns commits from all configured repos within that cutoff, grouped by
// day, so the client can build the 15-row table.
// ---------------------------------------------------------------------------
app.get('/api/commits', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    const cutoff = req.query.cutoff;

    if (!year || !month || !['first', 'second'].includes(cutoff)) {
      return res.status(400).json({ error: 'year, month, and cutoff (first|second) are required' });
    }

    const range = getCutoffRange(year, month, cutoff);
    const grouped = await getCommitsGroupedByDay(config.REPOS, range.start, range.end);
    const dates = getCutoffDates(year, month, cutoff);

    res.json({ range, grouped, dates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/form-image - serve the blank scanned form (for the calibrator)
// ---------------------------------------------------------------------------
app.get('/api/form-image', (req, res) => {
  res.sendFile(path.join(__dirname, config.FORM_IMAGE));
});

app.get('/api/form-image-meta', (req, res) => {
  res.json({
    width: config.FORM_IMAGE_WIDTH,
    height: config.FORM_IMAGE_HEIGHT,
    fieldPositions: config.FIELD_POSITIONS
  });
});

// ---------------------------------------------------------------------------
// POST /api/generate - body: { rows, totals, dateFiled, requestedBy }
// rows: [{ date, reason, time, hours }] (up to 15, already reviewed/edited
// by the user in the UI — hours is entered manually per your earlier answer)
// Returns a PDF for printing.
// ---------------------------------------------------------------------------
app.post('/api/generate', async (req, res) => {
  try {
    const { rows, totals, dateFiled, requestedBy, recommendingApproval, approvedBy } = req.body;
    const { pdfBuffer, pageCount } = await renderOverTimeFormPDF({
      rows,
      totals,
      dateFiled,
      requestedBy: requestedBy || config.REQUESTOR_NAME,
      recommendingApproval: recommendingApproval || config.RECOMMENDING_NAME,
      approvedBy: approvedBy || config.APPROVED_BY_NAME
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Page-Count', String(pageCount));
    res.setHeader('Access-Control-Expose-Headers', 'X-Page-Count');
    res.setHeader('Content-Disposition', 'inline; filename="overtime-request.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`OT system API listening on http://localhost:${PORT}`);
});
