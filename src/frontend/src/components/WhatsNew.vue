<script setup lang="ts">
/**
 * WhatsNew — version-based release notes popup.
 *
 * - Teleports to body so it overlays everything.
 * - Auto-opens 1.5s after mount when LATEST_VERSION > lastSeen (via App.vue).
 * - Backdrop click → close() (does NOT markSeen — preserve "still want to re-read" semantics).
 * - Esc → close() (same reason — not markSeen).
 * - "太棒了 ✓" button → markSeen() + close (suppresses future auto-opens).
 * - prefers-reduced-motion: no fade/scale animations.
 * - ARIA: role="dialog", aria-modal="true".
 */
import { watch, nextTick, onUnmounted, ref } from 'vue'
import { useWhatsNew } from '@/composables/useWhatsNew'
import { RELEASE_NOTES, LATEST_VERSION } from '@/data/whatsNew'
import { createFocusTrap } from '@/lib/focusTrap'

const { isOpen, close, markSeen } = useWhatsNew()

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(isOpen, async (visible) => {
  if (visible) {
    await nextTick()
    if (dialogRef.value) {
      trap.activate(dialogRef.value, () => close())
    }
    dialogRef.value?.focus()
  } else {
    trap.deactivate()
  }
})

onUnmounted(() => {
  trap.deactivate()
})

const GITHUB_PR_BASE = 'https://github.com/cct08311github/agent-monitor-web/pull/'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="wn-overlay"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        class="wn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wn-title"
        tabindex="-1"
        @keydown.esc.stop="close"
      >
        <!-- Header -->
        <div class="wn-header">
          <h2 id="wn-title" class="wn-title">✨ 最近更新 (v{{ LATEST_VERSION }})</h2>
          <button
            class="wn-close-btn"
            aria-label="關閉最近更新"
            @click="close"
          >✕</button>
        </div>

        <!-- Body: release notes list -->
        <div class="wn-body">
          <template
            v-for="release in RELEASE_NOTES"
            :key="release.version"
          >
            <ul class="wn-list">
              <li
                v-for="item in release.items"
                :key="item.title"
                class="wn-item"
              >
                <span class="wn-emoji" aria-hidden="true">{{ item.emoji }}</span>
                <div class="wn-item-content">
                  <span class="wn-item-title">{{ item.title }}</span>
                  <span
                    v-if="item.description"
                    class="wn-item-desc"
                  >{{ item.description }}</span>
                </div>
                <a
                  v-if="item.prNumber"
                  :href="`${GITHUB_PR_BASE}${item.prNumber}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="wn-pr-link"
                  :aria-label="`PR #${item.prNumber}`"
                >#{{ item.prNumber }}</a>
              </li>
            </ul>
          </template>
        </div>

        <!-- Footer -->
        <div class="wn-footer">
          <button
            class="wn-confirm-btn"
            @click="markSeen"
          >太棒了 ✓</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */

.wn-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

/* ── Dialog card ─────────────────────────────────────────────────────────── */

.wn-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.875rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  width: 100%;
  max-width: 560px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.wn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.wn-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.wn-close-btn {
  background: none;
  border: none;
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: color 0.15s, background 0.15s;
}

.wn-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.wn-body {
  overflow-y: auto;
  padding: 0.75rem 1.25rem 0.5rem;
  flex: 1;
}

/* ── List ────────────────────────────────────────────────────────────────── */

.wn-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.wn-item {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.45rem 0.25rem;
  border-radius: 0.375rem;
  transition: background 0.1s;
}

.wn-item:hover {
  background: var(--color-surface-hover, rgba(255,255,255,0.04));
}

.wn-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.04));
}

.wn-emoji {
  font-size: 1.1rem;
  flex-shrink: 0;
  margin-top: 1px;
  width: 1.4rem;
  text-align: center;
}

.wn-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.wn-item-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text, #cdd6f4);
  line-height: 1.4;
}

.wn-item-desc {
  font-size: 0.8rem;
  color: var(--color-muted, #6c7086);
  line-height: 1.4;
}

.wn-pr-link {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-accent, #89b4fa);
  text-decoration: none;
  opacity: 0.7;
  align-self: center;
  padding: 1px 4px;
  border-radius: 3px;
  transition: opacity 0.15s, background 0.15s;
}

.wn-pr-link:hover {
  opacity: 1;
  background: rgba(137, 180, 250, 0.1);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.wn-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.wn-confirm-btn {
  background: var(--color-accent, #89b4fa);
  border: none;
  color: #1e1e2e;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;
  padding: 0.45rem 1.25rem;
  border-radius: 0.5rem;
  transition: opacity 0.15s, transform 0.1s;
  line-height: 1.5;
}

.wn-confirm-btn:hover {
  opacity: 0.9;
}

.wn-confirm-btn:active {
  transform: scale(0.97);
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .wn-overlay,
  .wn-dialog,
  .wn-confirm-btn,
  .wn-item {
    transition: none;
    animation: none;
  }
}
</style>
