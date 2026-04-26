<script setup lang="ts">
import { Teleport, Transition } from 'vue'
import { useNotifyPrompt } from '@/composables/useNotifyPrompt'

const { isOpen, enable, decline, later, close } = useNotifyPrompt()

async function handleEnable(): Promise<void> {
  await enable()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="banner">
      <div
        v-if="isOpen"
        class="notify-prompt-banner"
        role="status"
        aria-live="polite"
        aria-label="桌面通知提示"
      >
        <span class="notify-prompt-banner__message">
          💡 想要在重要 alert 抵達時收到桌面通知嗎？
        </span>
        <div class="notify-prompt-banner__actions">
          <button
            class="notify-prompt-banner__btn notify-prompt-banner__btn--primary"
            type="button"
            @click="handleEnable"
          >啟用</button>
          <button
            class="notify-prompt-banner__btn"
            type="button"
            @click="decline"
          >不要，謝謝</button>
          <button
            class="notify-prompt-banner__btn notify-prompt-banner__btn--muted"
            type="button"
            @click="later"
          >之後再問</button>
        </div>
        <button
          class="notify-prompt-banner__dismiss"
          type="button"
          aria-label="關閉通知提示"
          @click="close"
        >✕</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Banner layout ────────────────────────────────────────────────────────── */

.notify-prompt-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: var(--bg-card, #1e2130);
  border-bottom: 1px solid var(--accent, #7c7cff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  font-size: 0.88rem;
  color: var(--text-primary, #e8eaf6);
  /* Ensure content wraps gracefully on small screens */
  flex-wrap: wrap;
}

.notify-prompt-banner__message {
  flex: 1;
  min-width: 0;
}

.notify-prompt-banner__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

.notify-prompt-banner__btn {
  padding: 0.28rem 0.7rem;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--text-primary, #e8eaf6);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.notify-prompt-banner__btn:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--accent, #7c7cff);
}

.notify-prompt-banner__btn--primary {
  background: var(--accent, #7c7cff);
  border-color: var(--accent, #7c7cff);
  color: #fff;
  font-weight: 600;
}

.notify-prompt-banner__btn--primary:hover {
  background: var(--accent-hover, #6466f1);
  border-color: var(--accent-hover, #6466f1);
}

.notify-prompt-banner__btn--muted {
  color: var(--text-muted, #8892b0);
  font-size: 0.78rem;
}

.notify-prompt-banner__dismiss {
  padding: 0.2rem 0.4rem;
  background: transparent;
  border: none;
  color: var(--text-muted, #8892b0);
  cursor: pointer;
  font-size: 0.82rem;
  line-height: 1;
  transition: color 0.15s;
  flex-shrink: 0;
}

.notify-prompt-banner__dismiss:hover {
  color: var(--text-primary, #e8eaf6);
}

/* ── Slide-down transition ────────────────────────────────────────────────── */

.banner-enter-active,
.banner-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.banner-enter-from,
.banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* ── Reduced motion override ─────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .banner-enter-active,
  .banner-leave-active {
    transition: opacity 0.15s ease;
  }

  .banner-enter-from,
  .banner-leave-to {
    transform: none;
    opacity: 0;
  }
}
</style>
