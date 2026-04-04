<script setup lang="ts">
import { ref } from 'vue'

const ready = ref(true)
</script>

<template>
  <div id="vue-root" v-if="ready">
    <p>Vue 3 + Vite + TypeScript — infrastructure ready.</p>
  </div>
</template>
