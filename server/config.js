// ---------------------------------------------------------------------------
// psc-ot-system config
// ---------------------------------------------------------------------------
// Edit REPOS to add/remove repositories that should be scanned for commits.
// `name` is just a label used in the UI. `path` is the local filesystem path
// to the git repo. `author` (optional) filters commits by git author email or
// name — leave blank to use whatever `git log` returns for the current user.
// ---------------------------------------------------------------------------

const REPOS = [
  {
    name: 'psc-enterprise-system',
    path: 'C:\\xampp\\htdocs\\psc-enterprise-system',
    author: '' // e.g. 'leinorain@example.com' — blank = all authors
  }
  // Add more repos here, e.g.:
  // { name: 'another-project', path: 'C:\\xampp\\htdocs\\another-project', author: '' }
];

// ---------------------------------------------------------------------------
// OVERTIME RULES
// ---------------------------------------------------------------------------
// How raw DTR punches (psc_dtr.time_logs) become overtime hours. Database
// credentials are NOT here — they live in the gitignored `dtr.config.js`.
//
// Overtime is only ever claimed in whole hours, so the clock-out is floored
// to the hour: out at 8:34 PM files as 6:00 PM - 8:00 PM (2 hrs), and out at
// 6:08 PM files nothing at all.
// ---------------------------------------------------------------------------

const OT_RULES = {
  // Mon-Fri regular hours end here; overtime is counted from this hour on.
  regularEndHour: 18, // 6:00 PM

  // Saturday/Sunday: the whole attendance is overtime, but the unpaid lunch
  // break is deducted when the span covers it. Time-in is rounded UP to the
  // hour on these days (in at 10:59 AM starts the claim at 11:00 AM).
  lunchStartHour: 12, // 12:00 NN
  lunchEndHour: 13,   //  1:00 PM

  // A clock-out past midnight is logged by the biometric device against the
  // FOLLOWING day (and mislabelled 'C/In'). A day with no clock-out therefore
  // borrows the next day's earliest punch, but only up to this time — beyond
  // it, the clock-out was genuinely forgotten and the row is flagged for you
  // to fill in by hand instead of being guessed at.
  crossoverCutoffMinutes: 4 * 60 // 4:00 AM
};

// Signatory names printed on the form. Requested by / Recommending approval /
// Approved by. These are defaults — they can be overridden per-form in the UI.
const REQUESTOR_NAME = 'Leinorain Autida';
const RECOMMENDING_NAME = 'APRIL GUIAN';
const APPROVED_BY_NAME = 'DONG ZAPATA';

// The scanned blank form — used ONLY as a reference image in the Calibrate
// tab (to click on and read off x%/y%). It is NOT printed into the PDF;
// the generated PDF is blank except for your data, meant to be fed through
// the printer on top of your physical pre-printed forms.
const FORM_IMAGE = 'assets/form.jpg';
const FORM_IMAGE_WIDTH = 1201;
const FORM_IMAGE_HEIGHT = 1599;

// Physical paper size the generated PDF is sized to. This should match
// whatever paper your printed forms are on. Default is Letter (8.5x11").
// Common PH office alternative is 8.5x13 ("long" / legal-ish) — adjust if
// your printed alignment is off top-to-bottom.
const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;

// ---------------------------------------------------------------------------
// FIELD POSITIONS
// ---------------------------------------------------------------------------
// All coordinates are PERCENTAGES (0-100) of the page width/height, measured
// from the top-left corner. Because they're percentages, the same numbers
// work whether you're calibrating against the reference image or printing
// onto PAGE_WIDTH_IN x PAGE_HEIGHT_IN paper.
//
// Use the calibrator tool (client "Calibrate" tab) to click on the reference
// image and get precise x%/y% values, then paste them in here.
//
// The table has `rowCount` rows (17 — matching the pre-printed form). `x`/`y`
// are the top-left of the table area, `height` is its total y% span, and each
// row's height is derived as height / rowCount (kept identical so the rows line
// up with the form's pre-printed lines). Column x% values are where each
// column's text should start. A reason longer than `reasonCharsPerLine` wraps
// onto the following row slot(s), so one long entry can consume several rows.
// ---------------------------------------------------------------------------

const FIELD_POSITIONS = {
  "dateFiled": {
    "x": 67.24,
    "y": 22.4
  },
  "table": {
    "x": 10.5,
    "y": 29.42,
    "width": 80,
    "height": 60.07,
    "rowCount": 17,
    "reasonCharsPerLine": 44,
    "columns": {
      "date": 15,
      "reason": 45,
      "time": 21,
      "hours": 14
    }
  },
  "totals": {
    "totalRegOT": {
      "x": 77.5,
      "y": 67.33
    },
    "sunHolOT": {
      "x": 77.5,
      "y": 70.49
    },
    "sunHolExcess": {
      "x": 77.24,
      "y": 73.86
    }
  },
  "requestedBy": {
    "x": 14.08,
    "y": 79.4
  },
  "recommendingApproval": {
    "x": 14.08,
    "y": 84
  },
  "approvedBy": {
    "x": 72.24,
    "y": 83.95
  }
};

module.exports = {
  REPOS,
  OT_RULES,
  REQUESTOR_NAME,
  RECOMMENDING_NAME,
  APPROVED_BY_NAME,
  FORM_IMAGE,
  FORM_IMAGE_WIDTH,
  FORM_IMAGE_HEIGHT,
  PAGE_WIDTH_IN,
  PAGE_HEIGHT_IN,
  FIELD_POSITIONS
};
