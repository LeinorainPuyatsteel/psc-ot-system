# PSC Overtime Request System

Fills your Puyat Steel "Overtime Request Form" from your actual biometric
attendance and your local git commit history, overlaid directly onto a scan of
the actual form, and exports a print-ready PDF.

**Stack:** Node/Express (API + Puppeteer PDF rendering) + Vue 3/Vite (review UI).
Reads commits with plain `git log` on your local repos — no GitHub API/token
needed since your repo lives at `C:\xampp\htdocs\psc-enterprise-system` — and
reads attendance straight from the `psc_dtr` MySQL database.

## How it works

1. You pick a cutoff period (6th–20th, or 21st–5th of next month).
2. The server pulls two things for that date range:
   - **Reason(s)** — `git log` on every repo listed in `server/config.js`,
     one entry per commit, grouped by day. All branches are scanned (local and
     remote-tracking), not just the one currently checked out, so the form
     doesn't miss work depending on where you left the repo. Stashes are not
     scanned.
   - **Time** and **No. of Hours** — your raw punches from the `time_logs`
     table of the `psc_dtr` database, converted to overtime by the rules in
     [Overtime rules](#overtime-rules) below.
3. The Vue UI shows one row per day with every column pre-filled and fully
   editable. Under each date it prints the punches the row was derived from
   (`in 8:01 AM · out 12:08 AM (next day)`) so the source is visible at a
   glance.
4. Days worked without any claimable overtime are left blank with a `no OT`
   note. Days where the clock-out is missing entirely are flagged in orange —
   those need hours typed in by hand.
5. Click "Generate & Print PDF" — the server produces a **blank PDF with
   only your data**, positioned to line up with the physical form
   (`server/config.js` → `FIELD_POSITIONS`, in percentages of the page).
   You feed your pre-printed Overtime Request forms through the printer and
   the data lands in the right spots.
6. The form has **17 rows** per sheet. If a cutoff period has commits on
   more than 17 distinct days, the PDF automatically **spans multiple
   pages** — one page per 17 rows — so you just feed that many blank forms
   into the printer. Totals and the "Requested by" line only print on the
   last page; "Date Filed" repeats on every page since each page is a
   separate physical sheet.

## Overtime rules

Overtime is only ever claimed in **whole hours**, so the clock-out is floored
to the hour — on a day whose regular hours end at 6:00 PM, out at 8:34 PM files
as 6:00 PM – 8:00 PM (2 hrs), and out at 6:08 PM files nothing at all.

Each day of the week is either a **working day**, where overtime runs from the
hour regular hours end to the floored clock-out, or a **rest day**, where the
whole attendance is overtime — time-in rounded **up** to the hour (in at
10:59 AM starts the claim at 11:00 AM) and the unpaid 12nn–1pm lunch deducted
when the span covers it.

Which is which depends on the schedule you work.

### Schedules

Pick yours from the **Schedule** box on the Review & Print tab. The two
built-in ones:

| | `five-day` | `five-half-day` |
| --- | --- | --- |
| **Mon–Thu** | regular to 6:00 PM | regular to 5:00 PM |
| **Fri** | regular to 5:00 PM | regular to 5:00 PM |
| **Sat** | rest day — all OT | half day: regular to 12 NN, lunch 12nn–1pm, **OT from 1:00 PM** |
| **Sun** | rest day — all OT | rest day — all OT |

The same Saturday punches therefore file very differently: in at 8:00 AM, out
at 3:10 PM is `8:00 AM – 3:00 PM`, 6 hrs (7 less lunch) on `five-day`, but
`1:00 PM – 3:00 PM`, 2 hrs on `five-half-day`. Saturday's lunch needs no
deduction on `five-half-day` — starting the claim at 1:00 PM already puts it
outside.

Schedules live in `server/config.js` → `SCHEDULES`, and `DEFAULT_SCHEDULE`
decides which one the box starts on. Add another by listing an end hour for
each day of the week (`null` = rest day). Changing the box affects the current
session only; it is never written back.

Sunday rows are checked as **Sun/Hol** and totalled separately; Saturday counts
as regular OT on either schedule. Public holidays aren't detected — tick the
box yourself.

### The past-midnight problem

When you clock out after midnight the biometric device records the punch
against the **following day**, and mislabels it `C/In`:

```
5156428   2158   07/21/2026 08:01   C/In    <- Tuesday's time-in
5156430   2158   07/22/2026 00:08   C/In    <- Tuesday's time-OUT, filed under Wednesday
```

So a day with no second punch borrows the next day's earliest punch as its
clock-out, but only up to **4:00 AM** (`crossoverCutoffMinutes`). Later than
that and the clock-out was genuinely forgotten, so the row is flagged instead
of guessed at. A borrowed punch is marked used, so Wednesday doesn't then
mistake Tuesday's clock-out for its own time-in.

The example above is a Tuesday, so on `five-day` it resolves to
`6:00 PM - 12:00 AM`, 6 hrs.

The `status` column is ignored entirely when pairing punches — it's unreliable
in both directions (some days open with a `C/Out`). First punch of the day is
the time-in, last is the time-out.

All of this is tunable in `server/config.js` — `SCHEDULES` for the per-day
hours, `OT_RULES` for the parts that don't vary by schedule (lunch window,
past-midnight cutoff).

## Setup

```bash
cd server
npm install
npm run dev        # starts API on http://localhost:4000

# in a second terminal
cd client
npm install
npm run dev         # starts UI on http://localhost:5173
```

Open http://localhost:5173.

> Puppeteer downloads a bundled Chromium on `npm install` — first install may
> take a minute and needs internet access.

If PDF generation fails with **"Could not find Chrome (ver. 127.0.6533.88)"**,
that download didn't happen (usually no internet at install time). Fetch it:

```bash
cd server
npx puppeteer browsers install chrome
```

The Chrome version is **pinned to the puppeteer version** — 22.15.0 wants
exactly 127.0.6533.88, and it only ever looks in `~/.cache/puppeteer` for that
build. A Chrome you have installed normally is never used, no matter how new,
so upgrading or reinstalling desktop Chrome has no effect on this error.
Bumping puppeteer changes which build it demands and needs a fresh download.

### DTR database credentials

The attendance database is configured separately from `config.js`, because
this repo has a public remote and credentials must not be committed:

```bash
cd server
cp dtr.config.example.js dtr.config.js   # then fill in host / user / password / empNo
```

`server/dtr.config.js` is gitignored. Every value can also come from an
environment variable, which wins over the file: `DTR_DB_HOST`, `DTR_DB_PORT`,
`DTR_DB_USER`, `DTR_DB_PASSWORD`, `DTR_DB_NAME`, `DTR_EMP_NO`, `ADMIN_PIN`.

The DTR server sits on the office LAN, so `/api/dtr` is the call that fails
when you're working off-site. That failure is isolated: commits still load,
the UI shows an orange warning, and Time/Hours fall back to manual entry.

### ID number (whose attendance to read)

`empNo` is the employee number matched against `time_logs.emp_no`. It is
prefilled into the **ID number** box on the Review & Print tab, and changing it
there loads a different employee's attendance for that session only — nothing
is written back to `dtr.config.js`, so reloading the page returns to your own.
Resolution order, most specific first:

1. the ID number box in the UI (`empNo` query param on `/api/dtr`)
2. the `DTR_EMP_NO` environment variable
3. `empNo` in `server/dtr.config.js`

Pointing the box at anybody but yourself also rewrites the parts of the form
that describe *you*, because they'd otherwise be silently wrong:

| Field | For another employee |
| --- | --- |
| **Requested by** | their `emp_full_name` from `psc_dtr.mast_employees` |
| **Recommending approval** / **Approved by** | blank — that table has no supervisor on record for anyone |
| **Reason(s)** | blank — it's built from commits in *your* repos, and nobody else here is a programmer |

Those three are yours to write in by hand, and the UI says so in orange while
the box differs from your default. They're only reset when the ID number
actually changes, so a name you correct by hand survives reloading a different
cutoff or schedule.

`emp_no` is not unique in `mast_employees` — the primary key is `(id, emp_no)`
and a rehire is filed as a new row — so the lookup prefers a row that isn't
`Resigned` and takes the highest `id` after that, which is the most recent
record.

### PIN

The **Repos**, **Layout** and **Calibrate** tabs rewrite `server/config.js`,
and a stray click in either of the last two shifts where text lands on the
pre-printed form. Set `adminPin` in `server/dtr.config.js` and they prompt for
it; one unlock covers all three until the page is reloaded. Leave it blank and
they stay open.

The PIN is checked by `POST /api/verify-pin` rather than in the browser, so it
never ships inside the JS bundle. It is a speed bump on the UI, **not access
control** — `POST /api/repos` and `PUT /api/field-positions` are still open to
anything that can reach the port.

## Configuring repos

Two ways:
- **UI:** "Repos" tab → add name / path / optional author filter. This
  rewrites `server/config.js` for you.
- **Manually:** edit `server/config.js` → `REPOS` array:

```js
const REPOS = [
  { name: 'psc-enterprise-system', path: 'C:\\xampp\\htdocs\\psc-enterprise-system', author: '' },
  { name: 'another-project', path: 'C:\\xampp\\htdocs\\another-project', author: '' }
];
```

`author` is optional — filters `git log --author=`. Leave blank to include
every author's commits in that repo (useful if you're the only committer).

## Calibrating field positions

The generated PDF is blank on purpose — it's meant to be printed directly
onto your physical pre-printed forms, so positions need to match your paper.
The scan you sent (`server/assets/form.jpg`) is bundled purely as an on-screen
reference for the **Calibrate** tab; it is never printed.

1. First set `PAGE_WIDTH_IN` / `PAGE_HEIGHT_IN` in `server/config.js` to
   match your actual paper (default: Letter 8.5x11").
2. Go to the **Calibrate** tab in the UI, click on the reference image where
   a field should sit (e.g. right on the first table row's "Date" column,
   or the "Date Filed" line).
3. It shows `x%, y%` — copy that value into `server/config.js` under the
   matching field. Percentages work regardless of paper size, as long as the
   reference image and your physical form have the same aspect ratio.
4. For the table, only `tableTop` (first row's y%) and `rowHeight` (spacing
   between rows) need adjusting — all 17 rows use the same column x%
   values and are evenly spaced from there.
5. Do a test print on plain paper, hold it over an actual blank form up to
   the light (or against a window) to check alignment, then adjust.

Re-generate a PDF after each tweak to check alignment.

## Notes / things you'll likely want to adjust

- **Sun/Hol detection** is automatic (Sunday = checked) but doesn't know
  Philippine holidays — the checkbox in the review table is editable per row.
- **Sun/Hol Excess** has no automatic source and is a plain manual input.
- Every DTR-derived value is a **starting point, not the final word** — Time
  and Hours stay editable, and only rows with hours > 0 are printed.
- `time_logs.date_time` is a VARCHAR (`MM/DD/YYYY HH:MM`), not a DATETIME, so
  it can't be range-queried or sorted in SQL. `lib/dtr.js` pulls the whole
  history for your `empNo` (a few thousand rows) and filters in JS. The table
  also stores each punch many times over under different ids, so punches are
  de-duplicated by timestamp.
- More than 17 days of overtime in one cutoff period → the PDF spans
  multiple pages automatically (see "How it works" above); no data is
  dropped.
- `REQUESTOR_NAME` in `config.js` is the default for "Requested by" — also
  editable per-generation in the UI.
- Reason(s) text is just the commit message(s) for that day, joined with
  `; ` — no repo name prefix, even when you have multiple repos configured.
