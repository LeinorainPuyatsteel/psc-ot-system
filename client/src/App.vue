<template>
  <div class="app">
    <header>
      <h1>Puyat Steel — Overtime Request System</h1>
      <nav>
        <button :class="{ active: tab === 'review' }" @click="tab = 'review'">Review &amp; Print</button>
        <button :class="{ active: tab === 'repos' }" @click="tab = 'repos'">Repos</button>
        <button :class="{ active: tab === 'layout' }" @click="tab = 'layout'">Layout</button>
        <button :class="{ active: tab === 'calibrate' }" @click="tab = 'calibrate'">Calibrate</button>
      </nav>
    </header>

    <main>
      <CommitReview v-if="tab === 'review'" />
      <RepoManager v-if="tab === 'repos'" />
      <LayoutAdjuster v-if="tab === 'layout'" />
      <Calibrator v-if="tab === 'calibrate'" />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import CommitReview from './components/CommitReview.vue';
import RepoManager from './components/RepoManager.vue';
import LayoutAdjuster from './components/LayoutAdjuster.vue';
import Calibrator from './components/Calibrator.vue';

const tab = ref('review');
</script>

<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    background: #f4f5f7;
    color: #1a1a2e;
  }
  .app { max-width: 1100px; margin: 0 auto; padding: 24px; }
  header h1 { font-size: 20px; margin-bottom: 12px; }
  nav { display: flex; gap: 8px; margin-bottom: 20px; }
  nav button {
    padding: 8px 16px;
    border: 1px solid #d0d3da;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }
  nav button.active { background: #10108a; color: #fff; border-color: #10108a; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #d0d3da; padding: 6px 8px; font-size: 13px; text-align: left; }
  th { background: #eceff3; }
  input[type=text], input[type=number], input[type=date], select, textarea {
    width: 100%; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;
  }
  textarea { resize: vertical; font-family: inherit; line-height: 1.35; }
  .btn {
    padding: 8px 16px; border: none; border-radius: 6px; background: #10108a; color: #fff;
    cursor: pointer; font-size: 14px;
  }
  .btn.secondary { background: #6b7280; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .row { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .card { background: #fff; border: 1px solid #e0e2e8; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .muted { color: #6b7280; font-size: 13px; }
</style>
