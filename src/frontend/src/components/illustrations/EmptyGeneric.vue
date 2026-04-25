<template>
  <svg
    width="120"
    height="120"
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Outer circle -->
    <circle cx="60" cy="60" r="44" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3" />
    <!-- Inner circle -->
    <circle cx="60" cy="60" r="28" stroke="currentColor" stroke-width="2" fill="none" opacity="0.5" />
    <!-- Empty box in center -->
    <rect x="44" y="44" width="32" height="32" rx="4" stroke="currentColor" stroke-width="2" fill="none" />
    <!-- Dashed diagonal lines (empty indication) -->
    <line x1="44" y1="44" x2="76" y2="76" stroke="currentColor" stroke-width="1.5" opacity="0.2" stroke-dasharray="4 3" />
    <line x1="76" y1="44" x2="44" y2="76" stroke="currentColor" stroke-width="1.5" opacity="0.2" stroke-dasharray="4 3" />
  </svg>
</template>
