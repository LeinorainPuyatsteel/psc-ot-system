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
// to the hour: on a day whose regular hours end at 6:00 PM, out at 8:34 PM
// files as 6:00 PM - 8:00 PM (2 hrs), and out at 6:08 PM files nothing at all.
//
// WHEN a day's regular hours end depends on the schedule being worked — see
// SCHEDULES below. The rules here are the parts that don't vary by schedule.
// ---------------------------------------------------------------------------

const OT_RULES = {
  // On rest days the whole attendance is overtime, but the unpaid lunch break
  // is deducted when the span covers it. Time-in is rounded UP to the hour on
  // those days (in at 10:59 AM starts the claim at 11:00 AM).
  lunchStartHour: 12, // 12:00 NN
  lunchEndHour: 13,   //  1:00 PM

  // A clock-out past midnight is logged by the biometric device against the
  // FOLLOWING day (and mislabelled 'C/In'). A day with no clock-out therefore
  // borrows the next day's earliest punch, but only up to this time — beyond
  // it, the clock-out was genuinely forgotten and the row is flagged for you
  // to fill in by hand instead of being guessed at.
  crossoverCutoffMinutes: 4 * 60 // 4:00 AM
};

// ---------------------------------------------------------------------------
// SCHEDULES
// ---------------------------------------------------------------------------
// Not everyone works the same week, and the same punches mean different
// overtime depending on which one you're on. Pick yours from the "Schedule"
// box on the Review & Print tab; DEFAULT_SCHEDULE below is what that box
// starts on.
//
// `regularEndHourByDay` gives, for each day of the week (0 = Sunday ...
// 6 = Saturday), the hour that day's REGULAR shift ends — overtime runs from
// there to the floored clock-out. `null` marks a rest day: no regular hours at
// all, so the whole attendance is overtime, the time-in is rounded UP to the
// hour, and the 12nn-1pm lunch comes off when the span covers it.
//
// Every day is listed explicitly, including the rest days. That's a few lines
// of repetition in exchange for never having to guess what an omitted day
// means.
// ---------------------------------------------------------------------------

const SCHEDULES = {
  'five-day': {
    label: '5-day week — Mon-Thu to 6 PM, Fri to 5 PM, Sat/Sun all OT',
    regularEndHourByDay: {
      0: null, // Sunday    - rest day
      1: 18,   // Monday    - 6:00 PM
      2: 18,   // Tuesday   - 6:00 PM
      3: 18,   // Wednesday - 6:00 PM
      4: 18,   // Thursday  - 6:00 PM
      5: 17,   // Friday    - 5:00 PM
      6: null  // Saturday  - rest day
    }
  },

  'five-half-day': {
    label: '5½-day week — Mon-Fri to 5 PM, Sat to 12 NN (OT from 1 PM), Sun all OT',
    regularEndHourByDay: {
      0: null, // Sunday    - rest day
      1: 17,   // Monday    - 5:00 PM
      2: 17,   // Tuesday   - 5:00 PM
      3: 17,   // Wednesday - 5:00 PM
      4: 17,   // Thursday  - 5:00 PM
      5: 17,   // Friday    - 5:00 PM
      // Saturday is a half day: regular hours run to 12 NN, then the unpaid
      // 12nn-1pm lunch. Overtime therefore starts at 1:00 PM — the lunch falls
      // outside the claim on its own, with nothing to deduct.
      6: 13    // Saturday  - 1:00 PM
    }
  }
};

// Which schedule the UI's Schedule box starts on. Must be a key of SCHEDULES.
const DEFAULT_SCHEDULE = 'five-day';

// Signatory names printed on the form. Requested by / Recommending approval /
// Approved by. These are defaults — they can be overridden per-form in the UI.
const REQUESTOR_NAME = 'LEINORAIN AUTIDA';
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
  SCHEDULES,
  DEFAULT_SCHEDULE,
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
