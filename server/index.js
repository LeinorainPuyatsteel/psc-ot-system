const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getCommitsGroupedByDay } = require('./lib/commits');
const {
  getOTGroupedByDay, getEmployeeName, resolveEmpNo, normalizeEmpNo, isKnownSchedule
} = require('./lib/dtr');
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
  // The default employee number is the one prefilled into the UI's ID number
  // box. It comes from the gitignored dtr.config.js — only the number is ever
  // exposed here, never the credentials sitting beside it. A broken or missing
  // DTR setup must not take this endpoint down with it, since the whole review
  // screen loads from it.
  let defaultEmpNo = null;
  try {
    defaultEmpNo = resolveEmpNo();
  } catch (err) {
    console.error('Could not read the default employee number:', err.message);
  }

  // The schedule list populates the UI's Schedule box. Sent from here rather
  // than from its own endpoint because this is already the call the review
  // screen bootstraps from, and the list only changes when config.js does.
  const schedules = Object.entries(config.SCHEDULES).map(([id, s]) => ({
    id,
    label: s.label
  }));

  res.json({
    repos: config.REPOS,
    requestorName: config.REQUESTOR_NAME,
    recommendingName: config.RECOMMENDING_NAME,
    approvedName: config.APPROVED_BY_NAME,
    defaultEmpNo,
    schedules,
    defaultSchedule: config.DEFAULT_SCHEDULE
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
// GET /api/dtr?year=2026&month=7&cutoff=first[&empNo=2158][&schedule=five-day]
// Actual overtime worked in that cutoff, derived from biometric punches in the
// psc_dtr database. Keyed by 'YYYY-MM-DD'. This fills the Time and No. of
// Hours columns; the Reason(s) column still comes from /api/commits.
//
// `empNo` is optional and reads a different employee than the one configured
// in dtr.config.js, for this request only — nothing is written back. The
// resolved number is echoed in the response so the UI can show whose
// attendance it is actually displaying.
//
// `schedule` is optional and picks which working week the punches are measured
// against (a key of config.SCHEDULES); it defaults to DEFAULT_SCHEDULE and,
// like empNo, is never written back.
//
// Kept separate from /api/commits on purpose: the DTR server sits on the
// office LAN, so this is the call that fails when you're working off-site,
// and the client degrades to manual hours instead of showing nothing.
// ---------------------------------------------------------------------------
app.get('/api/dtr', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    const cutoff = req.query.cutoff;

    if (!year || !month || !['first', 'second'].includes(cutoff)) {
      return res.status(400).json({ error: 'year, month, and cutoff (first|second) are required' });
    }

    // Rejected rather than ignored: silently falling back to the default here
    // would show one person's hours under another person's ID.
    const rawEmpNo = req.query.empNo;
    const supplied = rawEmpNo !== undefined && String(rawEmpNo).trim() !== '';
    if (supplied && normalizeEmpNo(rawEmpNo) === null) {
      return res.status(400).json({ error: 'empNo must be a positive whole number' });
    }

    // Same reasoning as empNo: an unrecognised schedule is rejected rather
    // than quietly falling back, since the fallback would file real hours
    // against the wrong working week without saying so.
    const rawSchedule = req.query.schedule;
    const scheduleSupplied = rawSchedule !== undefined && String(rawSchedule).trim() !== '';
    if (scheduleSupplied && !isKnownSchedule(rawSchedule)) {
      return res.status(400).json({
        error: `Unknown schedule '${rawSchedule}'. Known schedules: ${Object.keys(config.SCHEDULES).join(', ')}.`
      });
    }

    const empNo = resolveEmpNo(supplied ? rawEmpNo : undefined);
    const range = getCutoffRange(year, month, cutoff);

    // The name is a nicety — it fills in "Requested by" when you're filing for
    // somebody else. Not being able to look it up must not cost you the hours,
    // so it degrades to null and the field is left for you to type.
    const [dtr, empName] = await Promise.all([
      getOTGroupedByDay(range.start, range.end, empNo, scheduleSupplied ? rawSchedule : undefined),
      getEmployeeName(empNo).catch(err => {
        console.error(`Could not read the name for emp_no ${empNo}:`, err.message);
        return null;
      })
    ]);

    res.json({
      range,
      dtr,
      empNo,
      empName,
      schedule: scheduleSupplied ? rawSchedule : config.DEFAULT_SCHEDULE
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `DTR lookup failed: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/verify-pin - body: { pin } -> { ok }
//
// Gates the Repos / Layout / Calibrate tabs in the UI. The PIN is checked here
// rather than in the client so it never ships inside the JS bundle, where
// anyone with devtools could read it straight out of the source.
//
// What this is NOT: access control. The endpoints those tabs drive
// (POST /api/repos, PUT /api/field-positions) are still open, so this stops a
// misclick and a passer-by, not somebody determined. Gate the endpoints too if
// that ever matters.
//
// An unset adminPin means the tabs are open — a fresh clone with no
// dtr.config.js shouldn't be locked out of its own layout tools.
// ---------------------------------------------------------------------------
app.post('/api/verify-pin', (req, res) => {
  const expected = adminPin();
  if (!expected) return res.json({ ok: true, unset: true });

  const supplied = String((req.body && req.body.pin) || '');
  res.json({ ok: supplied === expected });
});

// GET /api/pin-required - whether the UI should bother prompting at all
app.get('/api/pin-required', (req, res) => {
  res.json({ required: !!adminPin() });
});

// Env var wins over the file, matching how the DB settings resolve. `require`
// caches, so changing the PIN in dtr.config.js needs a server restart.
function adminPin() {
  if (process.env.ADMIN_PIN) return String(process.env.ADMIN_PIN);
  try {
    const fileCfg = require('./dtr.config');
    return fileCfg && fileCfg.adminPin ? String(fileCfg.adminPin) : '';
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    return '';
  }
}

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
