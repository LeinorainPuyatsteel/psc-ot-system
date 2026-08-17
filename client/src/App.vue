<template>
  <div class="app">
    <header>
      <h1>Puyat Steel — Overtime Request System</h1>
      <nav>
        <button :class="{ active: tab === 'review' }" @click="tab = 'review'">Review &amp; Print</button>
        <button :class="{ active: tab === 'repos' }" @click="go('repos')">
          Repos<span v-if="showLock">&nbsp;🔒</span>
        </button>
        <button :class="{ active: tab === 'layout' }" @click="go('layout')">
          Layout<span v-if="showLock">&nbsp;🔒</span>
        </button>
        <button :class="{ active: tab === 'calibrate' }" @click="go('calibrate')">
          Calibrate<span v-if="showLock">&nbsp;🔒</span>
        </button>
      </nav>
    </header>

    <main>
      <CommitReview v-if="tab === 'review'" />
      <RepoManager v-if="tab === 'repos'" />
      <LayoutAdjuster v-if="tab === 'layout'" />
      <Calibrator v-if="tab === 'calibrate'" />
    </main>

    <div class="pin-backdrop" v-if="pinFor" @click.self="cancelPin">
      <form class="pin-box card" @submit.prevent="submitPin">
        <h2>Enter PIN</h2>
        <p class="muted">
          The {{ tabLabels[pinFor] }} tab changes settings that the printed form
          depends on. Unlocking lasts until you reload the page.
        </p>
        <input ref="pinInput" type="password" inputmode="numeric" v-model="pin"
               placeholder="PIN" autocomplete="off" />
        <p class="muted" style="color:#b00020" v-if="pinError">{{ pinError }}</p>
        <div class="row" style="margin:12px 0 0">
          <button class="btn" type="submit" :disabled="checking">
            {{ checking ? 'Checking…' : 'Unlock' }}
          </button>
          <button class="btn secondary" type="button" @click="cancelPin">Cancel</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import CommitReview from './components/CommitReview.vue';
import RepoManager from './components/RepoManager.vue';
import LayoutAdjuster from './components/LayoutAdjuster.vue';
import Calibrator from './components/Calibrator.vue';

const tab = ref('review');
const tabLabels = { repos: 'Repos', layout: 'Layout', calibrate: 'Calibrate' };

// Repos, Layout and Calibrate all rewrite server/config.js, and a stray click
// in any of them shifts where text lands on the pre-printed form. They sit
// behind a PIN for that reason — checked by the server, so it never ends up in
// the JS bundle. One unlock covers all three until the page is reloaded.
const unlocked = ref(false);
const pinRequired = ref(false);
const pinFor = ref('');      // which tab is waiting on the PIN, '' = no prompt
const pin = ref('');
const pinError = ref('');
const checking = ref(false);
const pinInput = ref(null);

const showLock = computed(() => pinRequired.value && !unlocked.value);

onMounted(async () => {
  // No PIN configured means no prompt — a fresh clone shouldn't be locked out
  // of its own layout tools. If this call fails the server is down, and every
  // one of these tabs is useless anyway.
  try {
    const res = await fetch('/api/pin-required').then(r => r.json());
    pinRequired.value = !!res.required;
  } catch {
    pinRequired.value = false;
  }
});

function go(target) {
  if (!pinRequired.value || unlocked.value) {
    tab.value = target;
    return;
  }
  pin.value = '';
  pinError.value = '';
  pinFor.value = target;
  nextTick(() => pinInput.value && pinInput.value.focus());
}

async function submitPin() {
  checking.value = true;
  pinError.value = '';
  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.value })
    }).then(r => r.json());

    if (!res.ok) {
      pinError.value = 'Wrong PIN.';
      pin.value = '';
      return;
    }
    unlocked.value = true;
    tab.value = pinFor.value;
    pinFor.value = '';
    pin.value = '';
  } catch {
    pinError.value = 'Could not reach the server to check the PIN.';
  } finally {
    checking.value = false;
  }
}

function cancelPin() {
  pinFor.value = '';
  pin.value = '';
  pinError.value = '';
}
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

  .pin-backdrop {
    position: fixed; inset: 0; background: rgba(16, 16, 138, .28);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .pin-box { width: 100%; max-width: 340px; margin: 0; }
  .pin-box h2 { font-size: 16px; margin: 0 0 6px; }
  .pin-box p { margin: 0 0 10px; }
</style>
