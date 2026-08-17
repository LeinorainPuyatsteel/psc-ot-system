// ---------------------------------------------------------------------------
// DTR database credentials  --  TEMPLATE
//
// Copy this file to `dtr.config.js` (same folder) and fill in your own values.
// `dtr.config.js` is gitignored: this repo has a public remote, so real
// credentials must never live in a tracked file.
//
// Every value can also be supplied by environment variable, which takes
// precedence over this file:
//   DTR_DB_HOST  DTR_DB_PORT  DTR_DB_USER  DTR_DB_PASSWORD  DTR_DB_NAME
//   DTR_EMP_NO  ADMIN_PIN
// ---------------------------------------------------------------------------

module.exports = {
  // PIN that unlocks the Repos / Layout / Calibrate tabs. It lives here rather
  // than in config.js for the same reason the credentials do — config.js is
  // tracked and this repo has a public remote. Leave it blank to leave those
  // tabs unlocked.
  //
  // This is a speed bump on the UI, not access control: it stops a misclick
  // (or somebody borrowing your screen) from rewriting your repo list or form
  // layout. The API endpoints behind those tabs are not themselves gated, so
  // don't treat it as protecting anything from someone determined.
  adminPin: '',

  host: '192.168.0.25',   // DTR server on the office LAN
  port: 3306,
  user: 'your-mysql-user',
  password: 'your-mysql-password',
  database: 'psc_dtr',

  // Your employee number, as it appears in time_logs.emp_no. This is only the
  // default — the "ID number" box on the Review & Print tab overrides it per
  // session without touching this file.
  empNo: 0
};
