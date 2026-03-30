/**
 * Keyboard Shortcuts - Keyboard navigation and shortcuts
 * Provides consistent keyboard shortcuts across the application
 */
(function () {
    'use strict';

    /**
     * Shortcut definitions
     * Format: { key, ctrl, shift, alt, meta, handler, description, category }
     */
    var shortcuts = [];

    /**
     * Register a keyboard shortcut
     * @param {Object} shortcut - Shortcut definition
     * @param {string} shortcut.key - Key (e.g., 'r', 'Enter', 'Escape')
     * @param {boolean} [shortcut.ctrl] - Requires Ctrl key
     * @param {boolean} [shortcut.shift] - Requires Shift key
     * @param {boolean} [shortcut.alt] - Requires Alt key
     * @param {boolean} [shortcut.meta] - Requires Meta (Cmd) key
     * @param {Function} shortcut.handler - Handler function
     * @param {string} shortcut.description - Shortcut description (for help)
     * @param {string} [shortcut.category] - Category for grouping (default: 'general')
     */
    function register(shortcut) {
        if (!shortcut || !shortcut.key || typeof shortcut.handler !== 'function') {
            console.warn('[KeyboardShortcuts] Invalid shortcut registration:', shortcut);
            return;
        }
        shortcuts.push(shortcut);
    }

    /**
     * Handle keydown event
     * @param {KeyboardEvent} event
     */
    function onKeyDown(event) {
        // Ignore if user is typing in an input/textarea/select
        var tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            // Exception: Escape should still work
            if (event.key !== 'Escape') return;
        }

        var modifiers = {
            ctrl: event.ctrlKey || event.metaKey, // Treat Ctrl and Cmd as equivalent
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
        };

        for (var i = 0; i < shortcuts.length; i++) {
            var shortcut = shortcuts[i];

            // Check if key matches
            if (event.key !== shortcut.key && event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
                continue;
            }

            // Check modifiers (only if specified in shortcut definition)
            if (shortcut.ctrl && !modifiers.ctrl) continue;
            if (shortcut.shift && !modifiers.shift) continue;
            if (shortcut.alt && !modifiers.alt) continue;
            if (shortcut.meta && !modifiers.meta) continue;

            // Prevent default if a shortcut matched
            event.preventDefault();
            event.stopPropagation();

            try {
                shortcut.handler(event, shortcut);
            } catch (err) {
                console.error('[KeyboardShortcuts] Handler error:', err);
            }

            return; // Only first matching shortcut fires
        }
    }

    /**
     * Show keyboard shortcuts help
     */
    function showHelp() {
        var categories = {};
        var categoryNames = {
            navigation: '導航',
            general: '一般',
            dashboard: '監控面板',
            logs: '日誌',
            commands: '命令',
        };

        shortcuts.forEach(function(s) {
            var cat = s.category || 'general';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(s);
        });

        var lines = ['📋 鍵盤快捷鍵：'];
        Object.keys(categories).forEach(function(cat) {
            lines.push('\n' + (categoryNames[cat] || cat) + ':');
            categories[cat].forEach(function(s) {
                var mods = [];
                if (s.ctrl) mods.push('⌃');
                if (s.shift) mods.push('⇧');
                if (s.alt) mods.push('⌥');
                if (s.meta) mods.push('⌘');
                var key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
                lines.push('  ' + mods.join('') + key + ' — ' + s.description);
            });
        });

        showToast(lines.join('\n'), 'info', { duration: 8000 });
    }

    /**
     * Unregister a shortcut (by handler reference)
     * @param {Function} handler
     */
    function unregister(handler) {
        for (var i = shortcuts.length - 1; i >= 0; i--) {
            if (shortcuts[i].handler === handler) {
                shortcuts.splice(i, 1);
            }
        }
    }

    // Register global keyboard listener
    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', onKeyDown);
    }

    // Export API
    var api = {
        register: register,
        unregister: unregister,
        showHelp: showHelp,
        getShortcuts: function() { return shortcuts.slice(); },
    };

    if (window.App && window.App.register) {
        App.register('KeyboardShortcuts', api);
    }
    window.KeyboardShortcuts = api;

    // Register default shortcuts
    register({
        key: '?',
        shift: true,
        handler: showHelp,
        description: '顯示快捷鍵幫助',
        category: 'general',
    });

    register({
        key: 'Escape',
        handler: function() {
            // Close any open modals/dialogs
            var modals = document.querySelectorAll('.modal, .dialog, [role="dialog"]');
            modals.forEach(function(modal) {
                var closeBtn = modal.querySelector('[aria-label="關閉"], .close, .modal-close');
                if (closeBtn) closeBtn.click();
            });
        },
        description: '關閉對話框/Modal',
        category: 'general',
    });

    register({
        key: 'r',
        ctrl: true,
        handler: function() {
            // Refresh dashboard
            if (typeof update === 'function') update(true);
        },
        description: '刷新監控面板',
        category: 'dashboard',
    });

})();
