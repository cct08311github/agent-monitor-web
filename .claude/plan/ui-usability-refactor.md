# Implementation Plan: UI Usability Refactor

## Task Type
- [x] Frontend (primary)
- [x] Fullstack (JS architecture + CSS + HTML)

## Context

agent-monitor-web is a vanilla HTML/CSS/JS monitoring dashboard (Express 4.18 backend, no framework, no build step). The frontend has ~600-line index.html, ~2200-line style.css, and ~12 JS IIFE modules. Current pain points:

- 30+ functions on `window.*` with no namespace structure
- No loading indicators, empty states, or skeleton loaders
- Color-only status coding (fails WCAG for color-blind users)
- No keyboard navigation, focus management, or ARIA labels
- Native `confirm()` for destructive actions (not customizable, not accessible)
- Toast disappears in 3s with no retry capability
- Log auto-scroll always snaps to bottom (disrupts reading)
- Single CSS breakpoint at 768px (no tablet layout)
- No form validation feedback
- SSE reconnect has no exponential backoff

## Technical Solution

Synthesized from dual-perspective analysis (architecture + UX design):

**Core principle: Zero framework, progressive enhancement.** New modules layer on top of existing code. No breaking rewrites.

### Architecture Layer
1. **Registry Pattern** (`js/registry.js`) — Single `window.App` namespace, replaces 30+ `window.*` exports. HTML onclick handlers go through `App.bindHandlers()`.
2. **SSE Exponential Backoff** — Upgrade `stream-manager.js` with backoff + jitter + Page Visibility API awareness.
3. **API Retry** — `api-client.js` gains `withRetry()` wrapper with exponential backoff.
4. **Unified Error Handling** — `handleError(error, context)` replaces 7 scattered catch patterns.

### UX Layer
5. **Focus Trap + Modal Manager** — Vanilla JS focus cycling, Escape-to-close, ARIA `role="dialog"`.
6. **Toast V2 with Retry** — Error toasts persist until dismissed, optional retry button, `aria-live` regions.
7. **Confirmation Dialog** — Replaces native `confirm()`, danger/warning types, focus on Cancel for destructive actions.
8. **Loading System** — Skeleton loaders (shimmer CSS), button loading state, progress banner.
9. **Form Validation** — Field-level errors with `aria-invalid`, blur-triggered real-time validation.
10. **Triple-Encoded Status Indicators** — Color + SVG icon + text label (WCAG AA compliant).
11. **Empty States** — Standardized pattern with icon, title, description, optional CTA.
12. **Smart Log Auto-scroll** — Only auto-scroll when near bottom; "scroll to bottom" floating button.
13. **Three-Breakpoint Responsive** — 599px (mobile), 1023px (tablet), 1400px+ (wide).
14. **Accessibility Foundation** — `:focus-visible` ring, skip link, ARIA tablist, `lang` attribute, semantic landmarks.

## Implementation Steps

### Phase 1 — Foundation: Registry + A11y + CSS Utilities (low risk, pure additions)

**Expected deliverable**: New infrastructure files, zero changes to existing behavior.

1. **Create `js/registry.js`** — `window.App = { register, get, bindHandlers }`
   - Load as first `<script>` in index.html
   - All existing code continues working (backward compatible)

2. **Create `css/a11y.css`** — Accessibility foundation
   - `:focus-visible` outline (2px solid accent, 2px offset)
   - `:focus:not(:focus-visible)` removes outline for mouse users
   - `.skip-link` positioned off-screen, visible on focus
   - High contrast mode `@media (forced-colors: active)` adjustments

3. **Create `css/ux-patterns.css`** — Shared UX component styles
   - Skeleton shimmer animation (`@keyframes skeleton-shimmer`)
   - `.skeleton`, `.agent-card-skeleton`, `.summary-card-skeleton`
   - `.btn-loading` with spinner pseudo-element
   - Empty state layout (`.empty-state`, `.empty-state-icon`, `.empty-state-title`, `.empty-state-desc`)
   - Toast V2 styles (`.toast-v2`, `.toast-visible`, `.toast-retry-btn`)
   - Confirmation dialog styles (`.confirm-overlay`, `.confirm-dialog`)
   - Form validation styles (`.input-error`, `.field-error-msg`)
   - Log scroll-to-bottom button (`.log-scroll-bottom-btn`)

4. **Modify `index.html`** — ARIA foundation (non-breaking)
   - Add `lang="zh-TW"` to `<html>`
   - Add skip link `<a class="skip-link" href="#agentGrid">跳至主要內容</a>`
   - Add `role="tablist"` to `.desktop-tabs`, `role="tab"` + `aria-selected` to each tab button
   - Add `aria-label` to all icon-only buttons (refresh, settings, theme toggle)
   - Add `role="status"` to `.agent-status` elements
   - Link new CSS files: `a11y.css`, `ux-patterns.css`
   - Link `registry.js` as first script

### Phase 2 — Core UX Modules (medium risk, new modules + shim layer)

**Expected deliverable**: 5 new JS modules, existing showToast shimmed.

5. **Create `js/ux/focus-trap.js`** — `window.FocusTrap = { activate, deactivate }`
   - FOCUSABLE selector constant
   - Tab/Shift+Tab cycling within container
   - Escape key triggers deactivation
   - Restores previous focus on deactivate

6. **Create `js/ux/toast-v2.js`** — `window.ToastManager = { show, dismiss }`
   - Type-based duration: info=4s, success=4s, warning=6s, error=persistent
   - Optional `retryFn` callback creates retry button
   - `aria-live="assertive"` for errors, `"polite"` for info
   - Left color bar + shape icon (double encoding)
   - Shim existing `showToast()`: internally calls `ToastManager.show()`

7. **Create `js/ux/confirm-dialog.js`** — `window.ConfirmDialog = { show }`
   - Options: `{ title, message, type, confirmLabel, cancelLabel, onConfirm, onCancel }`
   - Uses `FocusTrap.activate()` for focus management
   - Danger type: focus defaults to Cancel button (prevent accidental confirm)
   - Escape key = cancel

8. **Create `js/ux/loading.js`** — `window.LoadingManager = { showSkeletons, clearSkeletons, setButtonLoading, showProgress, hideProgress }`

9. **Create `js/ux/form-validator.js`** — `window.FormValidator = { validateForm, attachRealtimeValidation, RULES }`
   - Rules: required, maxLength, minLength, date, nonemptySelect
   - `setFieldError()`: toggles `.input-error` class, inserts `.field-error-msg` span
   - `aria-invalid` + `aria-describedby` for screen readers
   - Blur-triggered validation with input-event clearing

10. **Modify `index.html`** — Load new UX modules
    - Script order: registry.js → state.js → api-client.js → stream-manager.js → app.js → focus-trap.js → toast-v2.js → confirm-dialog.js → loading.js → form-validator.js → feature modules

### Phase 3 — Integration: Dashboard + Logs + Commands (medium risk)

**Expected deliverable**: Visible UX improvements in main views.

11. **Modify `js/modules/logs.js`** — Smart auto-scroll
    - Add `isNearBottom()` check (50px threshold)
    - Track `userScrolledUp` via scroll event listener (`{ passive: true }`)
    - `appendOcLogLine()`: only auto-scroll if `!userScrolledUp`
    - Show/update `.log-scroll-bottom-btn` with "↓ 新訊息" when new content arrives while scrolled up

12. **Modify `index.html`** — Add `.log-terminal-wrapper` around log terminals with scroll-to-bottom button

13. **Modify `js/dashboard-render.js`** — Loading + empty states + status indicators
    - `renderDashboard()`: show skeleton loaders before data arrives
    - Empty state: standardized component with icon/title/desc/CTA
    - `buildAgentCardEl()`: triple-encoded status (color + inline SVG + text label)
    - Add `role="status"` + `aria-label` to status elements

14. **Modify `js/command-actions.js`** — ConfirmDialog + ToastManager
    - `runCmd('restart')` → `ConfirmDialog.show({ type: 'warning', ... })`
    - `runCmd('update')` → `ConfirmDialog.show({ type: 'danger', ... })`
    - Error catch → `ToastManager.show(msg, 'error', { retryFn: () => runCmd(cmd) })`
    - Use `LoadingManager.setButtonLoading()` during command execution

15. **Modify `js/navigation.js`** — ARIA tab sync
    - `switchDesktopTab()`: update `aria-selected` on all tab buttons

### Phase 4 — TaskHub + Forms + Cron (medium risk)

**Expected deliverable**: TaskHub form validation, empty states in all views.

16. **Modify `js/modules/taskhub.js`** — Form validation + empty state
    - `submitAddTask()`: use `FormValidator.validateForm()` before API call
    - `openAddTaskModal()`: attach real-time validation via `FormValidator.attachRealtimeValidation()`
    - Empty task list: standardized empty state component
    - Use `FocusTrap.activate()` on task modals

17. **Modify `css/taskhub.css`** — Priority shape prefixes
    - Replace emoji-only priority badges with CSS `::before` shapes
    - `▲` urgent, `●` high, `��` medium, `▽` low (+ color)

18. **Modify cron view** — Empty state for no scheduled tasks

### Phase 5 — Architecture: SSE + Retry + Registry Migration (medium-high risk)

**Expected deliverable**: Reliable connections, cleaner module system.

19. **Modify `js/stream-manager.js`** — Exponential backoff + Page Visibility
    - Replace fixed 5s reconnect with exponential backoff (1s base, 30s max, ±20% jitter)
    - Reset attempt counter on successful connection
    - Add `onReconnecting(attempt, delay)` callback
    - Page Visibility API: pause SSE when hidden, reconnect when visible

20. **Modify `js/api-client.js`** — Add `withRetry(fn, maxAttempts, baseDelayMs)`
    - Exponential backoff: 1s, 2s, 4s
    - Skip retry on 401 (auth redirect)
    - Respect 429 Retry-After header

21. **Add `handleError(error, context)` to `js/app.js`** — Unified error handling
    - Replaces 7 scattered `pushLog + showToast` catch patterns

22. **Migrate modules to Registry** (gradual, per-module)
    - Each IIFE calls `App.register('moduleName', publicAPI)`
    - Only HTML onclick handlers use `App.bindHandlers()`
    - Remove direct `window.functionName` assignments

### Phase 6 — Responsive Breakpoints (low risk)

**Expected deliverable**: Proper tablet layout, improved mobile.

23. **Modify `css/style.css`** — Three-breakpoint system
    - `@media (max-width: 1023px) and (min-width: 600px)` — Tablet
      - 2-column agent grid, 2-column summary cards
      - Compact desktop tabs (smaller padding/font)
      - Single-column system/logs layout
    - `@media (max-width: 599px)` — Mobile (refined from current 768px)
      - 1-column agent grid
      - Bottom nav visible, desktop tabs hidden
      - Horizontal scroll for command buttons
      - Full-width modals

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `js/registry.js` | Create | App namespace + module registry |
| `css/a11y.css` | Create | Focus ring, skip link, forced-colors |
| `css/ux-patterns.css` | Create | All UX component styles |
| `js/ux/focus-trap.js` | Create | Modal focus management |
| `js/ux/toast-v2.js` | Create | Toast with retry + aria-live |
| `js/ux/confirm-dialog.js` | Create | Custom confirmation dialogs |
| `js/ux/loading.js` | Create | Skeleton + button + progress loading |
| `js/ux/form-validator.js` | Create | Field validation with ARIA |
| `index.html` | Modify | ARIA attrs, skip link, script loading, log wrapper |
| `css/style.css` | Modify | Three breakpoints, btn-loading |
| `css/taskhub.css` | Modify | Priority shape prefixes |
| `js/modules/logs.js` | Modify | Smart auto-scroll |
| `js/dashboard-render.js` | Modify | Skeleton, empty state, triple status |
| `js/command-actions.js` | Modify | ConfirmDialog + ToastManager |
| `js/navigation.js` | Modify | aria-selected sync |
| `js/modules/taskhub.js` | Modify | Form validation + empty state |
| `js/stream-manager.js` | Modify | Exponential backoff + visibility |
| `js/api-client.js` | Modify | withRetry wrapper |
| `js/app.js` | Modify | handleError + Validator |

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| showToast replacement breaks existing callers | Keep `showToast()` as shim that delegates to `ToastManager.show()` |
| Focus trap breaks modal close flows | FocusTrap.deactivate() called in every existing close function |
| SSE backoff too slow for monitoring use case | Cap max delay at 15s (not 30s), reset on visibility change |
| Registry migration breaks inline onclick handlers | `App.bindHandlers()` explicitly exposes needed functions to window |
| New CSS files override existing styles | Load after taskhub.css, use specific selectors, no `!important` except `.input-error` border |
| Responsive breakpoint changes affect existing layout | Test at 320px, 600px, 768px, 1024px, 1400px before merging |

## Verification Plan

Each phase should be verified by:
1. `npm test` — all 450+ backend tests pass
2. Manual browser test at 3 breakpoints (mobile/tablet/desktop)
3. Keyboard-only navigation test (Tab through all interactive elements)
4. Screen reader spot-check (VoiceOver on macOS)
5. Chrome DevTools Lighthouse accessibility audit (target: 90+)

## Phase Mapping to GitHub Issues

Each phase = one GitHub Issue + one branch + one PR:
- Phase 1: `feat(ui): add a11y foundation and UX CSS utilities`
- Phase 2: `feat(ui): add core UX modules (focus-trap, toast-v2, confirm, loading, form-validator)`
- Phase 3: `feat(ui): integrate UX modules into dashboard, logs, and commands`
- Phase 4: `feat(ui): add form validation and empty states to TaskHub and cron`
- Phase 5: `refactor(ui): SSE backoff, API retry, registry migration`
- Phase 6: `feat(ui): three-breakpoint responsive layout`
