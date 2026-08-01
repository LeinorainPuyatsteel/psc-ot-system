<template>
  <div class="card">
    <h3>Coordinate Calibrator</h3>
    <p class="muted">
      Click anywhere on the form below. It'll show the x%/y% position — copy that
      into <code>server/config.js</code> under <code>FIELD_POSITIONS</code> for whichever
      field you're placing (e.g. table row 1 date, "Date Filed", totals, etc).
    </p>

    <div class="row">
      <span class="muted">Last click:</span>
      <strong v-if="last">x: {{ last.xPct }}%, y: {{ last.yPct }}%</strong>
      <span v-else class="muted">—</span>
    </div>

    <div style="position:relative; display:inline-block; margin-top:12px; border:1px solid #d0d3da;">
      <img
        :src="imgSrc"
        @click="onClick"
        style="max-width:100%; display:block; cursor:crosshair;"
        ref="imgEl"
      />
      <div
        v-for="(m, i) in marks"
        :key="i"
        :style="{
          position: 'absolute',
          left: m.xPx + 'px',
          top: m.yPx + 'px',
          width: '6px',
          height: '6px',
          background: 'red',
          borderRadius: '50%',
          transform: 'translate(-3px, -3px)'
        }"
      />
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn secondary" @click="marks = []">Clear marks</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const imgSrc = '/api/form-image';
const imgEl = ref(null);
const last = ref(null);
const marks = ref([]);

function onClick(e) {
  const rect = imgEl.value.getBoundingClientRect();
  const xPx = e.clientX - rect.left;
  const yPx = e.clientY - rect.top;
  const xPct = +((xPx / rect.width) * 100).toFixed(2);
  const yPct = +((yPx / rect.height) * 100).toFixed(2);
  last.value = { xPct, yPct };
  marks.value.push({ xPx, yPx });
}
</script>
