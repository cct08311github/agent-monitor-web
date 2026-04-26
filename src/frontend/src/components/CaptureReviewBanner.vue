<script setup lang="ts">
import { Teleport, Transition, onMounted, onUnmounted, computed } from 'vue'
import { useCaptureReview } from '@/composables/useCaptureReview'
import { useQuickCapture } from '@/composables/useQuickCapture'

const { isOpen, dismissThisWeek, disableForever } = useCaptureReview()
const { openList, activeCaptures } = useQuickCapture()

const captureCount = computed(() => activeCaptures.value.length)

function handleOpenCaptures(): void {
  openList()
  dismissThisWeek()
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    dismissThisWeek()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="capture-review-banner">
      <div
        v-if="isOpen"
        class="capture-review-banner"
        role="status"
        aria-live="polite"
        aria-label="每週 Capture 回顧提醒"
      >
        <span class="capture-review-banner__icon" aria-hidden="true">📝</span>
        <div class="capture-review-banner__content">
          <span class="capture-review-banner__title">每週回顧</span>
          <span class="capture-review-banner__message">
            本週你累積了 <strong>{{ captureCount }}</strong> 筆 captures，要回顧一下嗎？
          </span>
        </div>
        <div class="capture-review-banner__actions">
          <button
            class="capture-review-banner__btn capture-review-banner__btn--primary"
            type="button"
            @click="handleOpenCaptures"
          >🚀 開啟 Captures</button>
          <button
            class="capture-review-banner__btn"
            type="button"
            @click="dismissThisWeek"
          >之後再說</button>
          <button
            class="capture-review-banner__btn capture-review-banner__btn--muted"
            type="button"
            @click="disableForever"
          >✕ 永遠關閉</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Banner layout ────────────────────────────────────────────────────────── */

.capture-review-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 92;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: var(--bg-card, #1e2130);
  border-bottom: 1px solid var(--accent, #7c7cff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  font-size: 0.88rem;
  color: var(--text-primary, #e8eaf6);
  flex-wrap: wrap;
}

.capture-review-banner__icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.capture-review-banner__content {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.capture-review-banner__title {
  font-weight: 700;
  color: var(--accent, #7c7cff);
  white-space: nowrap;
}

.capture-review-banner__message {
  color: var(--text-primary, #e8eaf6);
}

.capture-review-banner__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

.capture-review-banner__btn {
  padding: 0.28rem 0.7rem;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--text-primary, #e8eaf6);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.capture-review-banner__btn:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--accent, #7c7cff);
}

.capture-review-banner__btn:focus-visible {
  outline: 2px solid var(--accent, #7c7cff);
  outline-offset: 2px;
}

.capture-review-banner__btn--primary {
  background: var(--accent, #7c7cff);
  border-color: var(--accent, #7c7cff);
  color: #fff;
  font-weight: 600;
}

.capture-review-banner__btn--primary:hover {
  background: var(--accent-hover, #6466f1);
  border-color: var(--accent-hover, #6466f1);
}

.capture-review-banner__btn--muted {
  color: var(--text-muted, #8892b0);
  font-size: 0.78rem;
}

/* ── Slide-down transition ────────────────────────────────────────────────── */

.capture-review-banner-enter-active,
.capture-review-banner-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.capture-review-banner-enter-from,
.capture-review-banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* ── Reduced motion override ─────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .capture-review-banner-enter-active,
  .capture-review-banner-leave-active {
    transition: opacity 0.15s ease;
  }

  .capture-review-banner-enter-from,
  .capture-review-banner-leave-to {
    transform: none;
    opacity: 0;
  }
}
</style>
