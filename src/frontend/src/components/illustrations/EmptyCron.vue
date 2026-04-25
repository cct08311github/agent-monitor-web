<template>
  <svg
    width="120"
    height="120"
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Clock face -->
    <circle cx="56" cy="60" r="38" stroke="currentColor" stroke-width="2" fill="none" />
    <!-- Inner ring -->
    <circle cx="56" cy="60" r="32" stroke="currentColor" stroke-width="1" fill="none" opacity="0.2" />
    <!-- Center dot -->
    <circle cx="56" cy="60" r="3" fill="currentColor" opacity="0.6" />
    <!-- Hour hand (pointing ~12) -->
    <line x1="56" y1="60" x2="56" y2="34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    <!-- Minute hand (pointing ~3) -->
    <line x1="56" y1="60" x2="82" y2="60" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.8" />
    <!-- Hour marks -->
    <line x1="56" y1="26" x2="56" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    <line x1="88" y1="60" x2="84" y2="60" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    <line x1="56" y1="94" x2="56" y2="90" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    <line x1="24" y1="60" x2="28" y2="60" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    <!-- Plus overlay (schedule new) -->
    <circle cx="88" cy="36" r="16" fill="var(--bg-card, #1e1e24)" stroke="currentColor" stroke-width="2" />
    <line x1="88" y1="28" x2="88" y2="44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    <line x1="80" y1="36" x2="96" y2="36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  </svg>
</template>
