// ---------------------------------------------------------------------------
// DTR (attendance) -> overtime
//
// Reads raw biometric punches from the `time_logs` table of the psc_dtr MySQL
// database and turns them into one overtime entry per day.
//
// Things about that table worth knowing before touching this file:
//   * `date_time` is a VARCHAR holding 'MM/DD/YYYY HH:MM' — not a DATETIME —
//     so it can neither be range-queried nor sorted in SQL. Everything is
//     parsed and filtered here in JS instead.
//   * Every punch is stored many times over (the same timestamp appears under
//     a dozen different ids), so punches are de-duplicated by timestamp.
//   * `status` ('C/In' / 'C/Out') is NOT reliable and is deliberately ignored.
//     A clock-out past midnight gets logged as 'C/In' on the following day,
//     and some days start with a 'C/Out'. Pairing is positional: first punch
//     of the day is the time-in, last is the time-out.
// ---------------------------------------------------------------------------

const mysql = require('mysql2/promise');
const config = require('../config');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MS_PER_HOUR = 3600 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextDayISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + 1));
}

// 'MM/DD/YYYY HH:MM' -> local Date, or null when the value is malformed.
function parsePunch(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 12-hour clock, e.g. "6:00 PM", "12:00 AM" (midnight), "12:00 PM" (noon).
function formatTime(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}

function minutesIntoDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function floorToHour(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
}

function ceilToHour(d) {
  const floored = floorToHour(d);
  if (floored.getTime() === d.getTime()) return floored;
  return new Date(floored.getTime() + MS_PER_HOUR);
}

function atHour(d, hour) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/**
 * dtr.config.js may legitimately be absent (fresh clone, DB never set up).
 * Reading the file is kept separate from validating a full connection config so
 * that callers who only want the employee number don't fail over a missing DB
 * setup. `require` caches, so calling this repeatedly is free.
 */
function loadFileConfig() {
  try {
    return require('../dtr.config');
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    return null;
  }
}

// An employee number is only usable if it's a positive whole number; anything
// else (blank, NaN, '2158abc') is treated as "not supplied" so the next source
// in the chain gets its turn.
function normalizeEmpNo(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Which employee's punches to read, most specific source first:
 * explicit override (the UI's ID number box) > DTR_EMP_NO env var > the empNo
 * in dtr.config.js. Returns null when none of them yields a usable number.
 * Called with no argument, this is the configured default.
 */
function resolveEmpNo(override) {
  const fileCfg = loadFileConfig();
  return normalizeEmpNo(override)
    ?? normalizeEmpNo(process.env.DTR_EMP_NO)
    ?? normalizeEmpNo(fileCfg && fileCfg.empNo);
}

/**
 * DB credentials live in server/dtr.config.js, which is gitignored — this repo
 * has a public remote, so they must not sit in config.js next to the field
 * positions. Environment variables win over the file when both are set.
 *
 * `empNoOverride` lets a single request read a different employee's attendance
 * without touching the file or restarting; it is never written back.
 */
function loadDbConfig(empNoOverride) {
  const fileCfg = loadFileConfig();
  if (!fileCfg) {
    throw new Error(
      'server/dtr.config.js not found — copy server/dtr.config.example.js to ' +
      'server/dtr.config.js and fill in your DTR database credentials.'
    );
  }

  const cfg = {
    host: process.env.DTR_DB_HOST || fileCfg.host,
    port: Number(process.env.DTR_DB_PORT || fileCfg.port || 3306),
    user: process.env.DTR_DB_USER || fileCfg.user,
    password: process.env.DTR_DB_PASSWORD || fileCfg.password,
    database: process.env.DTR_DB_NAME || fileCfg.database || 'psc_dtr',
    empNo: resolveEmpNo(empNoOverride)
  };

  if (!cfg.host || !cfg.user || !cfg.empNo) {
    throw new Error('server/dtr.config.js is missing host, user, or empNo.');
  }
  return cfg;
}

function connect(dbCfg) {
  return mysql.createConnection({
    host: dbCfg.host,
    port: dbCfg.port,
    user: dbCfg.user,
    password: dbCfg.password,
    database: dbCfg.database,
    connectTimeout: 10000
  });
}

/**
 * Every punch on record for one employee, de-duplicated and sorted ascending.
 * The whole history is pulled in one go (a few thousand rows for a single
 * employee) because `date_time` being a VARCHAR rules out a SQL date filter.
 */
async function fetchPunches(dbCfg) {
  const conn = await connect(dbCfg);

  try {
    const [rows] = await conn.execute(
      'SELECT date_time, status FROM time_logs WHERE emp_no = ?',
      [dbCfg.empNo]
    );

    const byTimestamp = new Map();
    for (const r of rows) {
      const at = parsePunch(r.date_time);
      if (at) byTimestamp.set(at.getTime(), { at });
    }
    return [...byTimestamp.values()].sort((a, b) => a.at - b.at);
  } finally {
    await conn.end();
  }
}

/**
 * The employee's name as HR records it in `mast_employees`, or null when the
 * number isn't on file.
 *
 * `emp_no` is NOT unique there: the primary key is (id, emp_no) and a rehire
 * is filed as a second row rather than an update, so a few dozen numbers carry
 * more than one. A row still on strength therefore beats a resigned one, and
 * the highest id wins after that — the most recently added record.
 */
async function fetchEmployeeName(dbCfg) {
  const conn = await connect(dbCfg);

  try {
    const [rows] = await conn.execute(
      `SELECT emp_full_name FROM mast_employees
        WHERE emp_no = ?
        ORDER BY (emp_status = 'Resigned') ASC, id DESC
        LIMIT 1`,
      [dbCfg.empNo]
    );
    const name = rows.length ? String(rows[0].emp_full_name || '').trim() : '';
    return name || null;
  } finally {
    await conn.end();
  }
}

// ---------------------------------------------------------------------------
// Punches -> one { in, out } session per day
// ---------------------------------------------------------------------------

/**
 * Pair each day's punches into a session.
 *
 * A day with only one punch means the clock-out landed after midnight and was
 * recorded against the following day. Such a day borrows the next day's
 * earliest punches — but only those at or before `crossoverCutoffMinutes`
 * (default 4:00 AM). Later than that and the clock-out was genuinely missed,
 * which is reported as `noClockOut` rather than guessed at.
 *
 * Borrowed punches are marked consumed so the following day doesn't mistake
 * its predecessor's clock-out for its own time-in.
 */
function buildSessions(punches, crossoverCutoffMinutes) {
  const isEarly = p => minutesIntoDay(p.at) <= crossoverCutoffMinutes;

  const byDay = new Map();
  for (const p of punches) {
    const key = toISODate(p.at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }

  const consumed = new Set();
  const sessions = new Map();

  for (const day of [...byDay.keys()].sort()) {
    let own = byDay.get(day).filter(p => !consumed.has(p.at.getTime()));
    if (!own.length) continue;

    // An early-morning punch still unclaimed here belongs to a previous day
    // that has no punches at all (so nothing could borrow it). It is not a
    // time-in — drop it rather than let it open the day at 12:08 AM.
    if (isEarly(own[0])) {
      const rest = own.filter(p => !isEarly(p));
      if (!rest.length) {
        sessions.set(day, { date: day, in: null, out: null, orphan: true });
        continue;
      }
      own = rest;
    }

    const timeIn = own[0].at;
    let timeOut = own.length > 1 ? own[own.length - 1].at : null;
    let crossedMidnight = false;

    if (!timeOut) {
      const early = (byDay.get(nextDayISO(day)) || [])
        .filter(p => !consumed.has(p.at.getTime()) && isEarly(p));
      if (early.length) {
        timeOut = early[early.length - 1].at;
        early.forEach(p => consumed.add(p.at.getTime()));
        crossedMidnight = true;
      }
    }

    sessions.set(day, {
      date: day,
      in: timeIn,
      out: timeOut,
      crossedMidnight,
      noClockOut: !timeOut
    });
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// Session -> overtime entry
// ---------------------------------------------------------------------------

/**
 * The hour a day's regular shift ends under `schedule`, or null when that day
 * is a rest day. Days of the week are 0 = Sunday ... 6 = Saturday.
 */
function regularEndHourFor(dow, schedule) {
  const hour = schedule.regularEndHourByDay[dow];
  return Number.isInteger(hour) ? hour : null;
}

function isRestDayFor(dow, schedule) {
  return regularEndHourFor(dow, schedule) === null;
}

/**
 * Overtime for one session, in whole hours only — a partial hour is never
 * claimed, so the clock-out is floored to the hour (out 8:34 PM -> 8:00 PM).
 *
 *   Working day : regular hours run to the schedule's end hour for that day;
 *                 OT is the span from there to the floored clock-out.
 *   Rest day    : the whole attendance is OT. The time-in is rounded UP to the
 *                 hour (in 10:59 AM -> 11:00 AM) and the unpaid 12nn-1pm lunch
 *                 is deducted when the span covers it.
 *
 * Which days are which comes from `schedule` (config.SCHEDULES), not from the
 * calendar — a Saturday is a rest day on one schedule and a half day on
 * another.
 *
 * Returns null when the day yields no claimable whole hour.
 */
function computeOT(session, rules, schedule) {
  if (!session.in || !session.out) return null;

  const dow = session.in.getDay();
  const endHour = regularEndHourFor(dow, schedule);
  const isRestDay = endHour === null;

  let otStart = isRestDay
    ? ceilToHour(session.in)
    : atHour(session.in, endHour);

  // Guard against an unusually late time-in on a weekday: OT can never start
  // before the person was actually in the building.
  const earliestStart = ceilToHour(session.in);
  if (otStart < earliestStart) otStart = earliestStart;

  const otEnd = floorToHour(session.out);
  let hours = (otEnd - otStart) / MS_PER_HOUR;
  if (hours <= 0) return null;

  let lunchDeducted = false;
  if (isRestDay) {
    const lunchStart = atHour(otStart, rules.lunchStartHour);
    const lunchEnd = atHour(otStart, rules.lunchEndHour);
    if (otStart < lunchEnd && otEnd > lunchStart) {
      hours -= (lunchEnd - lunchStart) / MS_PER_HOUR;
      lunchDeducted = true;
    }
  }
  if (hours <= 0) return null;

  return {
    otStart: formatTime(otStart),
    otEnd: formatTime(otEnd),
    time: `${formatTime(otStart)} - ${formatTime(otEnd)}`,
    hours,
    lunchDeducted
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Whether `id` names a schedule that actually exists. Callers validate with
// this before resolving, so a typo is reported instead of quietly computing
// somebody's hours against the wrong week.
function isKnownSchedule(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(config.SCHEDULES, id);
}

/**
 * The schedule to compute against: the requested one, or DEFAULT_SCHEDULE when
 * none was asked for. Called with no argument, this is the configured default.
 */
function resolveSchedule(id) {
  const key = isKnownSchedule(id) ? id : config.DEFAULT_SCHEDULE;
  const schedule = config.SCHEDULES[key];
  if (!schedule) {
    throw new Error(
      `DEFAULT_SCHEDULE ('${config.DEFAULT_SCHEDULE}') is not a key of SCHEDULES in server/config.js.`
    );
  }
  return { id: key, ...schedule };
}

/**
 * Whose attendance `empNo` refers to, as HR spells it — 'AUTIDA, LEINORAIN N.'
 * Null when the number isn't in mast_employees. Omit `empNo` for the
 * configured default.
 */
async function getEmployeeName(empNo) {
  return fetchEmployeeName(loadDbConfig(empNo));
}

/**
 * Overtime for every day in [start, end] that has attendance, keyed by
 * 'YYYY-MM-DD'. Days worked without qualifying overtime are still returned
 * (hours 0) so the UI can show why a row is empty.
 *
 * `empNo` reads a different employee than the configured default; omit it for
 * your own attendance. `scheduleId` picks which working week the punches are
 * measured against; omit it for DEFAULT_SCHEDULE.
 */
async function getOTGroupedByDay(start, end, empNo, scheduleId) {
  const rules = config.OT_RULES;
  const schedule = resolveSchedule(scheduleId);
  const dbCfg = loadDbConfig(empNo);
  const punches = await fetchPunches(dbCfg);
  const sessions = buildSessions(punches, rules.crossoverCutoffMinutes);

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const result = {};

  for (const [day, session] of sessions) {
    if (day < startISO || day > endISO) continue;
    if (session.orphan) continue;

    const dow = session.in.getDay();
    const ot = computeOT(session, rules, schedule);

    result[day] = {
      date: day,
      dayName: DAY_NAMES[dow],
      timeIn: formatTime(session.in),
      timeOut: session.out ? formatTime(session.out) : null,
      time: ot ? ot.time : '',
      hours: ot ? ot.hours : 0,
      // Sun/Hol is a column on the printed form, not a property of the
      // schedule: a Sunday is a Sunday whichever week you work.
      sunHol: dow === 0,
      restDay: isRestDayFor(dow, schedule),
      crossedMidnight: session.crossedMidnight,
      noClockOut: session.noClockOut,
      lunchDeducted: ot ? ot.lunchDeducted : false
    };
  }

  return result;
}

module.exports = {
  getOTGroupedByDay,
  getEmployeeName,
  resolveEmpNo,
  normalizeEmpNo,
  resolveSchedule,
  isKnownSchedule,
  // exported for testing
  parsePunch,
  buildSessions,
  computeOT,
  formatTime
};
