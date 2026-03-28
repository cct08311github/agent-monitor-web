/**
 * Focus Trap — Modal focus management for keyboard accessibility.
 * Tab/Shift+Tab cycling within container, Escape to deactivate.
 * Restores previous focus on deactivate.
 */
(function () {
    'use strict';

    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var activeContainer = null;
    var previousFocus = null;
    var onDeactivateCb = null;

    function getFocusable(container) {
        return Array.from(container.querySelectorAll(FOCUSABLE)).filter(function (el) {
            return el.offsetParent !== null;
        });
    }

    function handleKeyDown(e) {
        if (!activeContainer) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            deactivate();
            return;
        }

        if (e.key !== 'Tab') return;

        var focusable = getFocusable(activeContainer);
        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }

        var first = focusable[0];
        var last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    function activate(container, opts) {
        if (activeContainer) deactivate();
        opts = opts || {};
        activeContainer = container;
        previousFocus = document.activeElement;
        onDeactivateCb = opts.onDeactivate || null;

        document.addEventListener('keydown', handleKeyDown, true);

        var initialFocus = opts.initialFocus
            ? container.querySelector(opts.initialFocus)
            : null;

        if (!initialFocus) {
            var focusable = getFocusable(container);
            initialFocus = focusable.length > 0 ? focusable[0] : container;
        }

        requestAnimationFrame(function () {
            initialFocus.focus();
        });
    }

    function deactivate() {
        if (!activeContainer) return;
        document.removeEventListener('keydown', handleKeyDown, true);
        var cb = onDeactivateCb;
        activeContainer = null;
        onDeactivateCb = null;

        if (previousFocus && previousFocus.focus) {
            previousFocus.focus();
        }
        previousFocus = null;

        if (typeof cb === 'function') cb();
    }

    function isActive() {
        return activeContainer !== null;
    }

    var api = { activate: activate, deactivate: deactivate, isActive: isActive };

    if (window.App && window.App.register) {
        App.register('FocusTrap', api);
    }
    window.FocusTrap = api;
})();
