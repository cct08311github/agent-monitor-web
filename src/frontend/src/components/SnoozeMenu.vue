<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SNOOZE_DURATIONS } from '@/utils/alertSnooze'

const emit = defineEmits<{
  select: [durationMs: number]
}>()

const open = ref(false)
const menuRef = ref<HTMLDivElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)

function toggle(): void {
  open.value = !open.value
}

function selectDuration(ms: number): void {
  open.value = false
  emit('select', ms)
}

function handleClickOutside(e: MouseEvent): void {
  const target = e.target as Node
  if (
    menuRef.value &&
    !menuRef.value.contains(target) &&
    triggerRef.value &&
    !triggerRef.value.contains(target)
  ) {
    open.value = false
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    open.value = false
    triggerRef.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="snooze-menu-wrap">
    <button
      ref="triggerRef"
      class="snooze-trigger"
      :aria-expanded="open"
      aria-haspopup="true"
      title="Snooze this alert"
      @click.stop="toggle"
    >
      ☕
    </button>
    <div
      v-if="open"
      ref="menuRef"
      class="snooze-popover"
      role="menu"
    >
      <button
        v-for="d in SNOOZE_DURATIONS"
        :key="d.ms"
        class="snooze-option"
        role="menuitem"
        @click.stop="selectDuration(d.ms)"
      >
        {{ d.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.snooze-menu-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.snooze-trigger {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s;
  color: inherit;
}

.snooze-trigger:hover,
.snooze-trigger:focus-visible {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--color-border, #444);
  outline: none;
}

.snooze-trigger[aria-expanded='true'] {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--color-accent, #6366f1);
}

.snooze-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  background: var(--color-bg-surface, #1e1e2e);
  border: 1px solid var(--color-border, #444);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  min-width: 120px;
  overflow: hidden;
}

.snooze-option {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px 14px;
  font-size: 13px;
  text-align: left;
  color: var(--color-text, #e5e5e5);
  transition: background 0.1s;
  white-space: nowrap;
}

.snooze-option:hover,
.snooze-option:focus-visible {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  outline: none;
}
</style>
