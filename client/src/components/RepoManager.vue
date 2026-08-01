<template>
  <div class="card">
    <h3>Repositories</h3>
    <p class="muted">Local git repos scanned for commits. Add as many as you work in.</p>

    <table>
      <thead>
        <tr><th>Name</th><th>Path</th><th>Author filter</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="r in repos" :key="r.name">
          <td>{{ r.name }}</td>
          <td>{{ r.path }}</td>
          <td>{{ r.author || '(any)' }}</td>
          <td><button class="btn secondary" @click="remove(r.name)">Remove</button></td>
        </tr>
      </tbody>
    </table>

    <div class="row" style="margin-top:16px">
      <label>Name <input type="text" v-model="newRepo.name" placeholder="my-project" style="width:160px" /></label>
      <label>Path <input type="text" v-model="newRepo.path" placeholder="C:\xampp\htdocs\my-project" style="width:280px" /></label>
      <label>Author (optional) <input type="text" v-model="newRepo.author" placeholder="me@example.com" style="width:180px" /></label>
      <button class="btn" @click="add" :disabled="!newRepo.name || !newRepo.path">Add Repo</button>
    </div>

    <p class="muted" v-if="error" style="color:#b00020">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const repos = ref([]);
const newRepo = ref({ name: '', path: '', author: '' });
const error = ref('');

onMounted(load);

async function load() {
  try {
    const res = await fetch('/api/repos');
    const data = await res.json();
    repos.value = data.repos;
  } catch (e) {
    error.value = 'Could not reach the server.';
  }
}

async function add() {
  error.value = '';
  try {
    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRepo.value)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    repos.value = data.repos;
    newRepo.value = { name: '', path: '', author: '' };
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(name) {
  error.value = '';
  try {
    const res = await fetch(`/api/repos/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    repos.value = data.repos;
  } catch (e) {
    error.value = e.message;
  }
}
</script>
