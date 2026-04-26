<script setup lang="ts">
import { computed } from 'vue'
import { highlightFuzzyMatch, type HighlightToken } from '@/utils/highlightTerms'

const props = defineProps<{ text: string; query: string }>()
const tokens = computed<HighlightToken[]>(() => highlightFuzzyMatch(props.text, props.query))
</script>

<template>
  <span>
    <template v-for="(tok, i) in tokens" :key="i">
      <mark v-if="tok.isMatch">{{ tok.text }}</mark>
      <template v-else>{{ tok.text }}</template>
    </template>
  </span>
</template>

<style scoped>
mark {
  background: var(--color-accent-soft, rgba(255, 235, 130, 0.5));
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
</style>
