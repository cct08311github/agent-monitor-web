<script setup lang="ts">
/**
 * OnboardingTour — 5-step centered-card walkthrough for first-time visitors.
 *
 * - Teleports to body so it overlays everything.
 * - Backdrop click does NOT close (prevent accidental mid-flow dismiss).
 * - Esc calls skip() (persists completed flag).
 * - prefers-reduced-motion: no fade/scale animations.
 * - ARIA: role="dialog", aria-modal="true", aria-labelledby on title.
 */
import { watch, nextTick, onUnmounted, ref } from 'vue'
import { useOnboardingTour } from '@/composables/useOnboardingTour'

const { isOpen, stepIndex, totalSteps, currentStep, isLast, isFirst, next, prev, skip } =
  useOnboardingTour()

const dialogRef = ref<HTMLDivElement | null>(null)

watch(isOpen, async (visible) => {
  if (visible) {
    await nextTick()
    dialogRef.value?.focus()
  }
})

onUnmounted(() => {
  // Nothing to clean up — no external listeners beyond the template keydown handler
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="ot-overlay"
      aria-hidden="false"
    >
      <div
        ref="dialogRef"
        class="ot-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ot-title"
        tabindex="-1"
        @keydown.esc.stop="skip"
      >
        <!-- Step counter -->
        <div class="ot-step-counter" aria-label="`步驟 ${stepIndex + 1} / ${totalSteps}`">
          <span
            v-for="i in totalSteps"
            :key="i"
            class="ot-step-dot"
            :class="{ 'ot-step-dot--active': i - 1 === stepIndex, 'ot-step-dot--done': i - 1 < stepIndex }"
            :aria-hidden="true"
          />
        </div>

        <!-- Title -->
        <h2 id="ot-title" class="ot-title">
          ({{ stepIndex + 1 }}/{{ totalSteps }}) {{ currentStep.title }}
        </h2>

        <!-- Description -->
        <p class="ot-description">{{ currentStep.description }}</p>

        <!-- Hint key (optional) -->
        <div v-if="currentStep.hintKey" class="ot-hint-row" aria-label="`快捷鍵：${currentStep.hintKey}`">
          <kbd class="ot-kbd">{{ currentStep.hintKey }}</kbd>
        </div>

        <!-- Footer actions -->
        <div class="ot-footer">
          <button
            class="ot-btn ot-btn--prev"
            :disabled="isFirst"
            :aria-disabled="isFirst"
            @click="prev"
          >上一步</button>

          <button
            class="ot-btn ot-btn--skip"
            @click="skip"
          >跳過</button>

          <button
            class="ot-btn ot-btn--next"
            @click="next"
          >{{ isLast ? '完成 ✓' : '下一步' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */

.ot-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

/* ── Card ────────────────────────────────────────────────────────────────── */

.ot-card {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  width: 100%;
  max-width: 480px;
  padding: 2rem 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  outline: none;
  /* Fade + scale entrance — disabled for reduced-motion via media query below */
  animation: ot-enter 0.2s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) both;
}

@keyframes ot-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ── Step dots ───────────────────────────────────────────────────────────── */

.ot-step-counter {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ot-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border, #313244);
  transition: background 0.2s;
}

.ot-step-dot--active {
  background: var(--color-accent, #89b4fa);
  width: 20px;
  border-radius: 4px;
}

.ot-step-dot--done {
  background: var(--color-accent, #89b4fa);
  opacity: 0.5;
}

/* ── Title ───────────────────────────────────────────────────────────────── */

.ot-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.35;
  color: var(--color-text, #cdd6f4);
}

/* ── Description ─────────────────────────────────────────────────────────── */

.ot-description {
  font-size: 0.9rem;
  line-height: 1.6;
  margin: 0;
  color: var(--color-text-secondary, #a6adc8);
}

/* ── Hint key row ────────────────────────────────────────────────────────── */

.ot-hint-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ot-kbd {
  display: inline-block;
  padding: 4px 12px;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 1rem;
  font-weight: 700;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 6px;
  box-shadow: 0 2px 0 var(--color-border, #313244);
  color: var(--color-accent, #89b4fa);
  letter-spacing: 0.02em;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

.ot-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-wrap: wrap;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

.ot-btn {
  padding: 0.45rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
  line-height: 1.4;
}

.ot-btn--prev {
  background: none;
  border-color: var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  margin-right: auto;
}

.ot-btn--prev:hover:not(:disabled) {
  border-color: var(--color-text, #cdd6f4);
  color: var(--color-text, #cdd6f4);
}

.ot-btn--prev:disabled {
  opacity: 0.3;
  cursor: default;
}

.ot-btn--skip {
  background: none;
  border: none;
  color: var(--color-muted, #6c7086);
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

.ot-btn--skip:hover {
  color: var(--color-text, #cdd6f4);
}

.ot-btn--next {
  background: var(--color-accent, #89b4fa);
  color: var(--color-surface, #1e1e2e);
  border-color: transparent;
  font-weight: 600;
}

.ot-btn--next:hover {
  opacity: 0.9;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .ot-card {
    animation: none;
  }

  .ot-step-dot {
    transition: none;
  }

  .ot-btn {
    transition: none;
  }
}
</style>
