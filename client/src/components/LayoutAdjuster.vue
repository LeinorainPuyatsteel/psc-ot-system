<template>
  <div class="card">
    <h3>Layout Adjuster</h3>
    <p class="muted">
      Drag the coloured dots and the table box directly on the form, or type exact
      values on the right. <strong>Save</strong> writes straight to
      <code>server/config.js</code> (no restart needed).
    </p>

    <p class="muted" v-if="err" style="color:#b00020">{{ err }}</p>

    <div class="row" v-if="fp" style="align-items:flex-start; gap:24px">
      <!-- ---------------- visual form + draggable overlays ---------------- -->
      <div style="flex:0 0 380px; max-width:380px">
        <div
          ref="imgWrap"
          style="position:relative; border:1px solid #d0d3da; user-select:none;"
        >
          <img
            :src="imgSrc"
            draggable="false"
            style="max-width:100%; display:block;"
          />

          <!-- table box -->
          <div
            class="lay-box"
            :style="{ left: fp.table.x + '%', top: fp.table.y + '%', width: fp.table.width + '%', height: fp.table.height + '%' }"
            @mousedown="startBoxMove"
            title="Drag to move the table"
          >
            <!-- row guides -->
            <div
              v-for="n in fp.table.rowCount"
              :key="'r' + n"
              class="lay-guide-h"
              :style="{ top: ((n - 1) / fp.table.rowCount * 100) + '%' }"
            />
            <!-- column dividers -->
            <div
              v-for="(cx, i) in colBounds"
              :key="'c' + i"
              class="lay-guide-v"
              :style="{ left: cx + '%' }"
            />
            <!-- resize handle -->
            <div class="lay-handle" @mousedown="startBoxResize" title="Drag to resize" />
          </div>

          <!-- point fields -->
          <div
            v-for="p in points"
            :key="p.label"
            class="lay-dot"
            :style="{ left: p.ref.x + '%', top: p.ref.y + '%', '--c': p.color }"
            @mousedown="(e) => startPointDrag(e, p.ref)"
          >
            <span class="lay-dot-label">{{ p.label }}</span>
          </div>
        </div>
        <p class="muted" style="margin-top:8px">
          Table = {{ fp.table.rowCount }} rows · row height
          {{ (fp.table.height / fp.table.rowCount).toFixed(2) }}% of page
        </p>
      </div>

      <!-- ---------------- numeric panel ---------------- -->
      <div style="flex:1; min-width:280px">
        <h4 class="lay-h">Table</h4>
        <div class="lay-grid">
          <label>x % <input type="number" step="0.1" v-model.number="fp.table.x" /></label>
          <label>y % <input type="number" step="0.1" v-model.number="fp.table.y" /></label>
          <label>width % <input type="number" step="0.1" v-model.number="fp.table.width" /></label>
          <label>height % <input type="number" step="0.1" v-model.number="fp.table.height" /></label>
          <label>rows / page <input type="number" step="1" min="1" v-model.number="fp.table.rowCount" /></label>
          <label>chars / line <input type="number" step="1" min="1" v-model.number="fp.table.reasonCharsPerLine" /></label>
        </div>

        <h4 class="lay-h">Column widths (% of table)</h4>
        <div class="lay-grid">
          <label>date <input type="number" step="1" v-model.number="fp.table.columns.date" /></label>
          <label>time <input type="number" step="1" v-model.number="fp.table.columns.time" /></label>
          <label>hours <input type="number" step="1" v-model.number="fp.table.columns.hours" /></label>
          <label>reason <input type="number" :value="reasonWidth" disabled title="auto — fills the remaining width" /></label>
        </div>

        <h4 class="lay-h">Points (x % / y %)</h4>
        <div class="lay-points">
          <div v-for="p in points" :key="'n' + p.label" class="lay-point-row">
            <span class="lay-swatch" :style="{ background: p.color }"></span>
            <span class="lay-point-name">{{ p.label }}</span>
            <input type="number" step="0.1" v-model.number="p.ref.x" />
            <input type="number" step="0.1" v-model.number="p.ref.y" />
          </div>
        </div>

        <div class="row" style="margin-top:16px">
          <button class="btn" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save to config.js' }}
          </button>
          <button class="btn secondary" @click="reload" :disabled="saving">Reload (discard)</button>
          <span class="muted" v-if="msg" style="color:#0a7">{{ msg }}</span>
        </div>
      </div>
    </div>

    <p class="muted" v-else>Loading…</p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const imgSrc = '/api/form-image';
const fp = ref(null);
const imgWrap = ref(null);
const saving = ref(false);
const msg = ref('');
const err = ref('');

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The five single-point fields, each pointing at its live object in fp so drags
// and number inputs edit the same source.
const points = computed(() => {
  if (!fp.value) return [];
  const t = fp.value.totals;
  const list = [
    { label: 'Date Filed', ref: fp.value.dateFiled, color: '#e11d48' },
    { label: 'Requested by', ref: fp.value.requestedBy, color: '#0a7d55' },
    { label: 'Total Reg OT', ref: t.totalRegOT, color: '#2563eb' },
    { label: 'Sun/Hol OT', ref: t.sunHolOT, color: '#7c3aed' },
    { label: 'Sun/Hol Excess', ref: t.sunHolExcess, color: '#d97706' }
  ];
  // Present only if the loaded config has them (older configs may not).
  if (fp.value.recommendingApproval) {
    list.push({ label: 'Recommending', ref: fp.value.recommendingApproval, color: '#0891b2' });
  }
  if (fp.value.approvedBy) {
    list.push({ label: 'Approved by', ref: fp.value.approvedBy, color: '#be123c' });
  }
  return list;
});

// reason column fills whatever the other three columns don't use.
const reasonWidth = computed(() => {
  if (!fp.value) return 0;
  const c = fp.value.table.columns;
  return round2(100 - c.date - c.time - c.hours);
});

// vertical divider positions (% of table width): after date, before time, before hours.
const colBounds = computed(() => {
  if (!fp.value) return [];
  const c = fp.value.table.columns;
  return [c.date, 100 - c.time - c.hours, 100 - c.hours].map((v) => clamp(v, 0, 100));
});

// ---- dragging ----
function pctFromEvent(e) {
  const rect = imgWrap.value.getBoundingClientRect();
  return {
    xPct: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    yPct: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

let dragMove = null;
function onWinMove(e) { if (dragMove) dragMove(pctFromEvent(e)); }
function onWinUp() {
  dragMove = null;
  window.removeEventListener('mousemove', onWinMove);
  window.removeEventListener('mouseup', onWinUp);
}
function beginDrag(handler) {
  dragMove = handler;
  window.addEventListener('mousemove', onWinMove);
  window.addEventListener('mouseup', onWinUp);
}

function startPointDrag(e, pt) {
  e.preventDefault();
  beginDrag(({ xPct, yPct }) => { pt.x = round2(xPct); pt.y = round2(yPct); });
}

function startBoxMove(e) {
  e.preventDefault();
  const start = pctFromEvent(e);
  const t = fp.value.table;
  const ox = t.x, oy = t.y;
  beginDrag(({ xPct, yPct }) => {
    t.x = clamp(round2(ox + (xPct - start.xPct)), 0, 100 - t.width);
    t.y = clamp(round2(oy + (yPct - start.yPct)), 0, 100 - t.height);
  });
}

function startBoxResize(e) {
  e.preventDefault();
  e.stopPropagation(); // don't also trigger a move
  const t = fp.value.table;
  beginDrag(({ xPct, yPct }) => {
    t.width = clamp(round2(xPct - t.x), 2, 100 - t.x);
    t.height = clamp(round2(yPct - t.y), 2, 100 - t.y);
  });
}

// ---- load / save ----
async function reload() {
  err.value = '';
  msg.value = '';
  try {
    const data = await fetch('/api/field-positions').then((r) => r.json());
    fp.value = data.fieldPositions;
  } catch (e) {
    err.value = 'Could not load positions — is the server running? (npm run dev in /server)';
  }
}

async function save() {
  saving.value = true;
  err.value = '';
  msg.value = '';
  try {
    const res = await fetch('/api/field-positions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldPositions: fp.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    fp.value = data.fieldPositions; // reflect the sanitized values the server stored
    msg.value = 'Saved to server/config.js';
  } catch (e) {
    err.value = e.message;
  } finally {
    saving.value = false;
  }
}

reload();
</script>

<style scoped>
.lay-box {
  position: absolute;
  border: 1.5px solid #10108a;
  background: rgba(16, 16, 138, 0.06);
  cursor: move;
}
.lay-guide-h {
  position: absolute;
  left: 0; right: 0;
  border-top: 1px dashed rgba(16, 16, 138, 0.35);
}
.lay-guide-v {
  position: absolute;
  top: 0; bottom: 0;
  border-left: 1px dashed rgba(16, 16, 138, 0.25);
}
.lay-handle {
  position: absolute;
  right: -5px; bottom: -5px;
  width: 10px; height: 10px;
  background: #10108a;
  border: 1px solid #fff;
  cursor: nwse-resize;
}
.lay-dot {
  position: absolute;
  width: 14px; height: 14px;
  margin: -7px 0 0 -7px; /* centre on the coordinate */
  border-radius: 50%;
  background: var(--c);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--c);
  cursor: grab;
}
.lay-dot:hover .lay-dot-label { display: block; }
.lay-dot-label {
  display: none;
  position: absolute;
  left: 16px; top: -2px;
  white-space: nowrap;
  background: #1a1a2e;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}
.lay-h { margin: 14px 0 6px; font-size: 13px; }
.lay-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 12px;
}
.lay-grid label { font-size: 12px; color: #6b7280; display: flex; flex-direction: column; gap: 2px; }
.lay-points { display: flex; flex-direction: column; gap: 6px; }
.lay-point-row { display: flex; align-items: center; gap: 8px; }
.lay-swatch { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
.lay-point-name { flex: 1; font-size: 13px; }
.lay-point-row input { width: 72px; }
</style>
