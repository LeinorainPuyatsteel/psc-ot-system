<template>
  <div>
    <div class="card">
      <div class="row">
        <label>Year
          <input type="number" v-model.number="year" style="width:90px" />
        </label>
        <label>Month
          <select v-model.number="month">
            <option v-for="m in 12" :key="m" :value="m">{{ monthNames[m] }}</option>
          </select>
        </label>
        <label>Cutoff
          <select v-model="cutoff">
            <option value="first">6th - 20th</option>
            <option value="second">21st - 5th (next month)</option>
          </select>
        </label>
        <label>ID number
          <input type="number" min="1" step="1" v-model.number="empNo"
                 :placeholder="defaultEmpNo || 'emp no.'" style="width:100px" />
        </label>
        <label>Schedule
          <select v-model="schedule" @change="loadPeriod" :disabled="loading">
            <option v-for="s in schedules" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <button class="btn" @click="loadPeriod" :disabled="loading">
          {{ loading ? 'Loading…' : 'Load' }}
        </button>
        <button class="btn secondary" v-if="isOtherEmployee" @click="resetEmpNo">
          Back to {{ defaultEmpNo }}
        </button>
      </div>
      <p class="muted" v-if="rangeLabel">Period: {{ rangeLabel }}</p>
      <p class="muted" v-if="error" style="color:#b00020">{{ error }}</p>

      <p class="muted note-warn" v-if="isOtherEmployee">
        Filing for {{ empName || `ID ${empNo}` }}, not yourself ({{ defaultEmpNo }}).
        <strong>Reason(s), Recommending approval and Approved by are left blank</strong>
        — the reasons are built from commits in <em>your</em> repos, and this
        database carries no supervisor for anyone. Write all three in by hand.
      </p>

      <p class="muted note-warn" v-if="dtrError">
        Attendance unavailable — {{ dtrError }}<br />
        Time and No. of Hours are left blank; fill them in by hand. The DTR
        server sits on the office LAN, so this is expected when you're off-site.
      </p>
      <p class="muted" v-else-if="dtrLoaded">
        Attendance: {{ dtrDays.length }} day(s) worked, {{ dtrTotalHours }} OT hr(s) computed.
        <span class="note-warn" v-if="missingClockOut.length">
          — {{ missingClockOut.length }} day(s) have no clock-out on record and need manual hours.
        </span>
      </p>
    </div>

    <div class="card" v-if="rows.length">
      <div class="row">
        <label>Date Filed
          <input type="date" v-model="dateFiled" />
        </label>
        <label>Requested by
          <input type="text" v-model="requestedBy" style="width:220px" />
        </label>
        <label>Recommending approval
          <input type="text" v-model="recommendingApproval" style="width:220px" />
        </label>
        <label>Approved by
          <input type="text" v-model="approvedBy" style="width:220px" />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:110px">Date</th>
            <th>Reason(s)</th>
            <th style="width:180px">Time</th>
            <th style="width:80px">Hours</th>
            <th style="width:70px">Sun/Hol</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i">
            <td>
              {{ row.date }}
              <div class="muted dtr-note" :class="{ 'note-warn': row.warn }" v-if="row.note">
                {{ row.note }}
              </div>
            </td>
            <td>
              <textarea v-model="row.reason" rows="3"></textarea>
            </td>
            <td>
              <input type="text" v-model="row.time" />
            </td>
            <td>
              <input type="number" step="0.5" min="0" v-model.number="row.hours" />
            </td>
            <td style="text-align:center">
              <input type="checkbox" v-model="row.sunHol" />
            </td>
          </tr>
        </tbody>
      </table>

      <p class="muted" v-if="printableRows.length">
        {{ printableRows.length }} day(s) with hours will be printed
        (≈ {{ Math.ceil(printableRows.length / rowsPerPage) }} page(s) at {{ rowsPerPage }} rows/form;
        long reasons may add more). Rows with blank/0 hours are skipped.
      </p>

      <div class="row" style="margin-top:16px">
        <label>Total Reg. O.T. hrs.
          <input type="text" :value="totalRegOT" disabled style="width:80px" />
        </label>
        <label>Sun/Hol O.T. hrs.
          <input type="text" :value="totalSunHolOT" disabled style="width:80px" />
        </label>
        <label>Sun/Hol Excess
          <input type="number" step="0.5" v-model.number="sunHolExcess" style="width:80px" />
        </label>
      </div>

      <button class="btn" @click="generate" :disabled="generating" style="margin-top:12px">
        {{ generating ? 'Generating…' : 'Generate & Print PDF' }}
      </button>
      <span class="muted" v-if="lastPageCount" style="margin-left:10px">
        Generated {{ lastPageCount }} page(s) — feed {{ lastPageCount }} blank form sheet(s) into the printer.
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth() + 1);
const cutoff = ref('first');
// Which employee's punches to read. Defaults to the empNo in dtr.config.js;
// changing it here affects this session only and is never written back.
const empNo = ref('');
const defaultEmpNo = ref(null);
// Which working week those punches are measured against. The list and the
// starting value both come from config.js (SCHEDULES / DEFAULT_SCHEDULE);
// like the ID number, picking another one lasts for this session only.
const schedule = ref('');
const schedules = ref([]);
// The name behind the ID, read from psc_dtr.mast_employees on each load.
const empName = ref('');
// The signatory names as configured in config.js. Kept so switching back to
// your own ID can put them back after another employee blanked them out.
const defaultNames = ref({ requestedBy: '', recommendingApproval: '', approvedBy: '' });
// Whose form the signatories currently describe, so they're only rewritten
// when the employee actually changes — reloading a different cutoff or
// schedule shouldn't discard a name you typed in by hand.
const signatoriesFor = ref(null);
const rangeLabel = ref('');
const loading = ref(false);
const generating = ref(false);
const error = ref('');

const rows = ref([]);
const rowsPerPage = ref(17);
const dateFiled = ref(new Date().toISOString().slice(0, 10));
const requestedBy = ref('');
const recommendingApproval = ref('');
const approvedBy = ref('');
const sunHolExcess = ref(0);
const lastPageCount = ref(null);

// Attendance (DTR) is loaded separately from commits so that losing the office
// LAN degrades to manual hours instead of breaking the whole screen.
const dtrLoaded = ref(false);
const dtrError = ref('');
const dtrDays = ref([]);

const dtrTotalHours = computed(() => dtrDays.value.reduce((sum, d) => sum + d.hours, 0));
const missingClockOut = computed(() => dtrDays.value.filter(d => d.noClockOut));

// Looking at somebody else's attendance is legitimate but easy to do by
// accident, so it gets called out on screen rather than passing silently.
const isOtherEmployee = computed(() =>
  !!defaultEmpNo.value && !!empNo.value && Number(empNo.value) !== Number(defaultEmpNo.value)
);

function resetEmpNo() {
  empNo.value = defaultEmpNo.value;
  loadPeriod();
}

/**
 * The three signatory names say whose form this is, so they follow the ID
 * number. Filing for somebody else makes them the requestor — under the name
 * HR has on file — and blanks the two approval lines, because mast_employees
 * carries no supervisor and a stale "APRIL GUIAN" printed on another
 * department's form would be worse than an empty line.
 *
 * Only runs when the employee actually changed, so a name corrected by hand
 * survives reloading a different cutoff or schedule.
 */
function applySignatories() {
  const current = Number(empNo.value) || null;
  if (current === signatoriesFor.value) return;
  signatoriesFor.value = current;

  if (isOtherEmployee.value) {
    requestedBy.value = empName.value || '';
    recommendingApproval.value = '';
    approvedBy.value = '';
  } else {
    requestedBy.value = defaultNames.value.requestedBy;
    recommendingApproval.value = defaultNames.value.recommendingApproval;
    approvedBy.value = defaultNames.value.approvedBy;
  }
}

// Only days where hours were actually entered get printed onto the form.
const printableRows = computed(() => rows.value.filter(r => Number(r.hours) > 0));

const totalRegOT = computed(() =>
  printableRows.value.filter(r => !r.sunHol).reduce((sum, r) => sum + Number(r.hours), 0)
);
const totalSunHolOT = computed(() =>
  printableRows.value.filter(r => r.sunHol).reduce((sum, r) => sum + Number(r.hours), 0)
);

onMounted(async () => {
  try {
    const [cutoffRes, repoRes, metaRes] = await Promise.all([
      fetch('/api/cutoff/current').then(r => r.json()),
      fetch('/api/repos').then(r => r.json()),
      fetch('/api/form-image-meta').then(r => r.json())
    ]);
    year.value = cutoffRes.year;
    month.value = cutoffRes.month;
    cutoff.value = cutoffRes.cutoff;
    defaultNames.value = {
      requestedBy: repoRes.requestorName || '',
      recommendingApproval: repoRes.recommendingName || '',
      approvedBy: repoRes.approvedName || ''
    };
    requestedBy.value = defaultNames.value.requestedBy;
    recommendingApproval.value = defaultNames.value.recommendingApproval;
    approvedBy.value = defaultNames.value.approvedBy;
    defaultEmpNo.value = repoRes.defaultEmpNo ?? null;
    empNo.value = defaultEmpNo.value ?? '';
    schedules.value = repoRes.schedules || [];
    schedule.value = repoRes.defaultSchedule || (schedules.value[0] && schedules.value[0].id) || '';
    rowsPerPage.value = metaRes.fieldPositions?.table?.rowCount || 17;
    await loadPeriod();
  } catch (e) {
    error.value = 'Could not reach the server — is it running? (npm run dev in /server)';
  }
});

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

// Short summary of the punches behind a row, so it's obvious where the Time
// and Hours came from — and why they're blank when they are.
function dtrNote(d) {
  if (!d) return '';
  if (d.noClockOut) return `in ${d.timeIn} · no clock-out on record`;

  const parts = [`in ${d.timeIn}`, `out ${d.timeOut}${d.crossedMidnight ? ' (next day)' : ''}`];
  if (d.lunchDeducted) parts.push('less 1h lunch');
  if (!d.hours) parts.push('no OT');
  return parts.join(' · ');
}

async function loadPeriod() {
  loading.value = true;
  error.value = '';
  dtrError.value = '';
  dtrLoaded.value = false;
  dtrDays.value = [];

  const qs = `year=${year.value}&month=${month.value}&cutoff=${cutoff.value}`;
  // The ID number selects whose punches to read and the schedule decides how
  // they're counted; commits always come from the local repos, so neither is
  // ever sent to the commits call.
  let dtrQs = qs;
  if (empNo.value) dtrQs += `&empNo=${encodeURIComponent(empNo.value)}`;
  if (schedule.value) dtrQs += `&schedule=${encodeURIComponent(schedule.value)}`;

  try {
    // Attendance failing must not take the commits down with it, so it is
    // settled separately and its error is reported on its own.
    const [commitRes, dtrRes] = await Promise.all([
      fetch(`/api/commits?${qs}`).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load commits');
        return data;
      }),
      fetch(`/api/dtr?${dtrQs}`)
        .then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Failed to load attendance');
          return data;
        })
        .catch(e => ({ error: e.message }))
    ]);

    rangeLabel.value = commitRes.range.label;

    const dtr = dtrRes.error ? {} : (dtrRes.dtr || {});
    if (dtrRes.error) {
      dtrError.value = dtrRes.error;
    } else {
      dtrLoaded.value = true;
      dtrDays.value = Object.values(dtr);
    }
    empName.value = dtrRes.empName || '';
    applySignatories();

    // One row per calendar day in the cutoff. Reason(s) comes from commits;
    // Time and No. of Hours come from the DTR punches. Everything stays
    // editable — these are a starting point, not the final word.
    rows.value = commitRes.dates.map(dateISO => {
      const dayCommits = commitRes.grouped[dateISO] || [];
      const day = dtr[dateISO];
      const dow = new Date(dateISO + 'T12:00:00').getDay(); // 0 = Sunday

      // Reason(s) is built from commits in your own local repos, so it only
      // ever describes your work — nobody else here is a programmer. Filing
      // for somebody else leaves the column blank to be written in by hand
      // rather than attributing your commits to them.
      const reason = isOtherEmployee.value
        ? ''
        : dayCommits
          .map(c => c.message)
          .filter(m => m.trim().toLowerCase() !== 'previous commit')
          .join('; ');

      return {
        date: fmtDate(dateISO),
        reason,
        time: day ? day.time : '',
        hours: day && day.hours ? day.hours : '',
        sunHol: day ? day.sunHol : dow === 0,
        note: dtrNote(day),
        warn: !!(day && day.noClockOut)
      };
    });
  } catch (e) {
    error.value = e.message;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function generate() {
  generating.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: printableRows.value,
        totals: {
          totalRegOT: totalRegOT.value || '',
          sunHolOT: totalSunHolOT.value || '',
          sunHolExcess: sunHolExcess.value || ''
        },
        dateFiled: fmtDate(dateFiled.value),
        requestedBy: requestedBy.value,
        recommendingApproval: recommendingApproval.value,
        approvedBy: approvedBy.value
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to generate PDF');
    }
    lastPageCount.value = res.headers.get('X-Page-Count');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    error.value = e.message;
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
  .dtr-note { font-size: 11px; line-height: 1.3; margin-top: 3px; }
  .note-warn { color: #b45309; }
</style>
