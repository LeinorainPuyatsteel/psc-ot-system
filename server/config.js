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
    "x": 11.84,
    "y": 29.42,
    "width": 84.08,
    "height": 60.07,
    "rowCount": 17,
    "reasonCharsPerLine": 40,
    "columns": {
      "date": 15,
      "reason": 45,
      "time": 20,
      "hours": 20
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
