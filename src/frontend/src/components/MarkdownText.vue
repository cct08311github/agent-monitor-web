<script setup lang="ts">
import { computed } from 'vue'
import { parseMarkdown } from '@/utils/markdownRender'
import type { MdInlineNode } from '@/utils/markdownRender'

const props = defineProps<{ text: string }>()
const blocks = computed(() => parseMarkdown(props.text))

function inlineKey(node: MdInlineNode, idx: number): string {
  return `${node.kind}-${idx}`
}
</script>

<template>
  <div class="md-body">
    <template v-for="(block, bi) in blocks" :key="bi">
      <!-- Paragraph -->
      <p v-if="block.kind === 'paragraph'" class="md-paragraph">
        <template v-for="(node, ni) in block.inlines" :key="inlineKey(node, ni)">
          <strong v-if="node.kind === 'bold'">{{ node.text }}</strong>
          <em v-else-if="node.kind === 'italic'">{{ node.text }}</em>
          <code v-else-if="node.kind === 'code'" class="md-code">{{ node.text }}</code>
          <a
            v-else-if="node.kind === 'link'"
            :href="node.url"
            target="_blank"
            rel="noopener noreferrer"
            class="md-link"
            >{{ node.text }}</a
          >
          <template v-else>{{ node.text }}</template>
        </template>
      </p>

      <!-- Heading — use h3 to avoid clashing with page heading hierarchy -->
      <h3
        v-else-if="block.kind === 'heading'"
        class="md-heading"
        :data-level="block.level"
      >
        <template v-for="(node, ni) in block.inlines" :key="inlineKey(node, ni)">
          <strong v-if="node.kind === 'bold'">{{ node.text }}</strong>
          <em v-else-if="node.kind === 'italic'">{{ node.text }}</em>
          <code v-else-if="node.kind === 'code'" class="md-code">{{ node.text }}</code>
          <a
            v-else-if="node.kind === 'link'"
            :href="node.url"
            target="_blank"
            rel="noopener noreferrer"
            class="md-link"
            >{{ node.text }}</a
          >
          <template v-else>{{ node.text }}</template>
        </template>
      </h3>

      <!-- List -->
      <ul v-else-if="block.kind === 'list'" class="md-list">
        <li v-for="(item, ii) in block.items" :key="ii" class="md-list-item">
          <template v-for="(node, ni) in item" :key="inlineKey(node, ni)">
            <strong v-if="node.kind === 'bold'">{{ node.text }}</strong>
            <em v-else-if="node.kind === 'italic'">{{ node.text }}</em>
            <code v-else-if="node.kind === 'code'" class="md-code">{{ node.text }}</code>
            <a
              v-else-if="node.kind === 'link'"
              :href="node.url"
              target="_blank"
              rel="noopener noreferrer"
              class="md-link"
              >{{ node.text }}</a
            >
            <template v-else>{{ node.text }}</template>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.md-body {
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

.md-paragraph {
  margin: 0 0 0.25em;
}

.md-paragraph:last-child {
  margin-bottom: 0;
}

.md-heading {
  font-size: 0.9em;
  font-weight: 600;
  margin: 0.4em 0 0.2em;
  line-height: 1.3;
}

.md-heading[data-level='1'] {
  font-size: 1em;
}

.md-heading:first-child {
  margin-top: 0;
}

.md-list {
  margin: 0.15em 0 0.25em 1.2em;
  padding: 0;
}

.md-list-item {
  margin-bottom: 0.15em;
}

.md-code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  background: var(--color-code-bg, rgba(128, 128, 128, 0.12));
  border-radius: 3px;
  padding: 0.1em 0.3em;
}

.md-link {
  color: var(--color-accent, #4a9eff);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md-link:hover {
  opacity: 0.8;
}
</style>
