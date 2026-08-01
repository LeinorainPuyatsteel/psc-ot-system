// ---------------------------------------------------------------------------
// Cutoff period helpers
// Two cutoffs per month:
//   "first"  : 6th  -> 20th of the SAME month
//   "second" : 21st -> 5th  of the FOLLOWING month
// ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Given a year, month (1-12) and cutoff id ('first' | 'second'),
 * return { start: Date, end: Date, label: string }
 */
function getCutoffRange(year, month, cutoff) {
  // month is 1-12
  if (cutoff === 'first') {
    const start = new Date(year, month - 1, 6, 0, 0, 0);
    const end = new Date(year, month - 1, 20, 23, 59, 59);
    return { start, end, label: `${monthName(month)} 6-20, ${year}` };
  }

  if (cutoff === 'second') {
    const start = new Date(year, month - 1, 21, 0, 0, 0);
    // 5th of the following month
    const endMonthDate = new Date(year, month, 5, 23, 59, 59); // month is already +1 since Date month index is 0-based and we didn't subtract
    return {
      start,
      end: endMonthDate,
      label: `${monthName(month)} 21 - ${monthName(month === 12 ? 1 : month + 1)} 5, ${month === 12 ? year + 1 : year}`
    };
  }

  throw new Error(`Unknown cutoff: ${cutoff}`);
}

/**
 * Every calendar date in a cutoff period as an array of 'YYYY-MM-DD' strings,
 * inclusive of both ends. Used to pre-populate a row for every day, whether or
 * not it has commits.
 */
function getCutoffDates(year, month, cutoff) {
  const { start, end } = getCutoffRange(year, month, cutoff);
  const dates = [];
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (day <= last) {
    dates.push(toISODate(day));
    day.setDate(day.getDate() + 1);
  }
  return dates;
}

/**
 * Figure out which cutoff "today" (or a given date) currently falls in.
 * Returns { year, month, cutoff }
 */
function currentCutoff(refDate = new Date()) {
  const day = refDate.getDate();
  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1;

  if (day >= 6 && day <= 20) {
    return { year, month, cutoff: 'first' };
  }
  if (day >= 21) {
    return { year, month, cutoff: 'second' };
  }
  // day 1-5 belongs to the "second" cutoff that STARTED the previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return { year: prevYear, month: prevMonth, cutoff: 'second' };
}

function monthName(m) {
  return ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][m];
}

module.exports = { getCutoffRange, getCutoffDates, currentCutoff, toISODate, monthName };
