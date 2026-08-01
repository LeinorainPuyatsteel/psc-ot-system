const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const {
  PAGE_WIDTH_IN,
  PAGE_HEIGHT_IN,
  FIELD_POSITIONS
} = require('../config');

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fieldDiv(text, xPct, yPct, cls = '') {
  return `<div class="field ${cls}" style="left:${xPct}%;top:${yPct}%">${esc(text)}</div>`;
}

function buildHeaderFieldsHTML(dateFiled) {
  const F = FIELD_POSITIONS;
  return fieldDiv(dateFiled || '', F.dateFiled.x, F.dateFiled.y);
}

function buildFooterFieldsHTML(totals, signatures) {
  const F = FIELD_POSITIONS;
  const fields = [
    fieldDiv(totals.totalRegOT ?? '', F.totals.totalRegOT.x, F.totals.totalRegOT.y),
    fieldDiv(totals.sunHolOT ?? '', F.totals.sunHolOT.x, F.totals.sunHolOT.y),
    fieldDiv(totals.sunHolExcess ?? '', F.totals.sunHolExcess.x, F.totals.sunHolExcess.y),
    fieldDiv(signatures.requestedBy || '', F.requestedBy.x, F.requestedBy.y)
  ];
  // Guarded so an older config without these positions still renders.
  if (F.recommendingApproval) {
    fields.push(fieldDiv(signatures.recommendingApproval || '', F.recommendingApproval.x, F.recommendingApproval.y));
  }
  if (F.approvedBy) {
    fields.push(fieldDiv(signatures.approvedBy || '', F.approvedBy.x, F.approvedBy.y));
  }
  return fields.join('\n');
}

// Word-wrap a reason into lines that each fit the reason column. The form uses a
// monospace font, so wrapping by character count matches the printed column
// width. Tune `reasonCharsPerLine` in config after a test print.
function wrapReason(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the column: hard-split it across lines.
    let rest = word;
    while (rest.length > maxChars) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

// Expand each entry into one *physical* row per wrapped reason line. Date, time
// and hours print on the entry's first line only; continuation lines carry just
// the rest of the reason. The result is a flat stream of physical rows — a
// 12-line reason becomes 12 rows — which is what actually gets paginated, so a
// single long commit can fill a page and spill onto the next.
function toPhysicalRows(entries) {
  const maxChars = FIELD_POSITIONS.table.reasonCharsPerLine;
  const physical = [];
  for (const entry of entries) {
    const lines = wrapReason(entry.reason, maxChars);
    lines.forEach((line, i) => {
      const first = i === 0;
      physical.push({
        date: first ? (entry.date || '') : '',
        reason: line,
        time: first ? (entry.time || '') : '',
        hours: first && entry.hours != null ? entry.hours : ''
      });
    });
  }
  return physical;
}

// Slice physical rows into pages. The pre-printed form has `rowCount` rows and
// one PDF page overlays one physical form, so that's the rows-per-page limit
// (read fresh each call so edits from the Layout adjuster take effect without a
// server restart). Always returns at least one page so a blank form still prints.
function paginate(physicalRows) {
  const rowsPerPage = FIELD_POSITIONS.table.rowCount;
  const pages = [];
  for (let i = 0; i < physicalRows.length; i += rowsPerPage) {
    pages.push(physicalRows.slice(i, i + rowsPerPage));
  }
  return pages.length ? pages : [[]];
}

// Render one page's physical rows (never more than ROWS_PER_PAGE). Every row is
// given the same fixed height so the slots line up with the form's pre-printed
// lines; empty trailing slots are simply left blank.
function buildTableHTML(pageRows) {
  const T = FIELD_POSITIONS.table;
  const rowHeight = T.height / T.rowCount; // % of page height per row

  const rowsHTML = pageRows.map(row => `
      <div class="table-row" style="height:${rowHeight}%">
        <div class="table-cell" style="flex:0 0 ${T.columns.date}%">${esc(row.date)}</div>
        <div class="table-cell" style="flex:1">${esc(row.reason)}</div>
        <div class="table-cell" style="flex:0 0 ${T.columns.time}%">${esc(row.time)}</div>
        <div class="table-cell" style="flex:0 0 ${T.columns.hours}%">${esc(row.hours)}</div>
      </div>`).join('\n');

  return `<div class="table-box" style="left:${T.x}%;top:${T.y}%;width:${T.width}%;height:${T.height}%">${rowsHTML}</div>`;
}

/**
 * @param {object} opts { rows, totals, dateFiled, requestedBy, recommendingApproval, approvedBy }
 */
async function renderOverTimeFormPDF(opts) {
  const pages = paginate(toPhysicalRows(opts.rows || []));

  const templatePath = path.join(__dirname, '..', 'templates', 'overlay.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const pagesHTML = pages.map((pageRows, idx) => {
    const isLastPage = idx === pages.length - 1;
    const parts = [
      buildHeaderFieldsHTML(opts.dateFiled),
      buildTableHTML(pageRows)
    ];
    // Totals + signatures belong only on the final form.
    if (isLastPage) {
      parts.push(buildFooterFieldsHTML(opts.totals || {}, {
        requestedBy: opts.requestedBy,
        recommendingApproval: opts.recommendingApproval,
        approvedBy: opts.approvedBy
      }));
    }
    return `<div class="page">${parts.join('\n')}</div>`;
  }).join('\n');

  html = html
    .replace(/{{PAGE_WIDTH}}/g, PAGE_WIDTH_IN)
    .replace(/{{PAGE_HEIGHT}}/g, PAGE_HEIGHT_IN)
    .replace('{{PAGES}}', pagesHTML);

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH_IN}in`,
      height: `${PAGE_HEIGHT_IN}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    return { pdfBuffer, pageCount: pages.length };
  } finally {
    await browser.close();
  }
}

module.exports = { renderOverTimeFormPDF };
