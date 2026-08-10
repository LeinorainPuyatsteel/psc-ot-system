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
//   DTR_EMP_NO
// ---------------------------------------------------------------------------

module.exports = {
  host: '192.168.0.25',   // DTR server on the office LAN
  port: 3306,
  user: 'your-mysql-user',
  password: 'your-mysql-password',
  database: 'psc_dtr',

  // Your employee number, as it appears in time_logs.emp_no
  empNo: 0
};
