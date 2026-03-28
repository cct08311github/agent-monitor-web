/**
 * Toast V2 — Enhanced notifications with retry, auto-dismiss by type, and aria-live.
 * Error toasts persist until dismissed; optional retryFn creates a retry button.
 * Shims existing showToast() to delegate here.
 */
(function () {
    'use strict';

    var DURATIONS = { info: 4000, success: 4000, warning: 6000, error: 0 };
    var ICONS = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    var container = null;

    function ensureContainer() {
        if (container) return container;
        container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('role', 'status');
            document.body.appendChild(container);
        }
        return container;
    }

    function show(msg, type, opts) {
        type = type || 'info';
        opts = opts || {};
        var el = ensureContainer();

        var toast = document.createElement('div');
        toast.className = 'toast-v2 toast-' + type;
        if (type === 'error') {
            el.setAttribute('aria-live', 'assertive');
        } else {
            el.setAttribute('aria-live', 'polite');
        }

        var icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = ICONS[type] || ICONS.info;
        toast.appendChild(icon);

        var msgSpan = document.createElement('span');
        msgSpan.className = 'toast-msg';
        msgSpan.textContent = msg;
        toast.appendChild(msgSpan);

        var actions = document.createElement('span');
        actions.className = 'toast-actions';

        if (typeof opts.retryFn === 'function') {
            var retryBtn = document.createElement('button');
            retryBtn.className = 'toast-retry-btn';
            retryBtn.textContent = '重試';
            retryBtn.onclick = function () {
                dismiss(toast);
                opts.retryFn();
            };
            actions.appendChild(retryBtn);
        }

        var closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', '關閉通知');
        closeBtn.onclick = function () { dismiss(toast); };
        actions.appendChild(closeBtn);

        toast.appendChild(actions);
        el.appendChild(toast);

        requestAnimationFrame(function () {
            toast.classList.add('toast-visible');
        });

        var duration = opts.duration != null ? opts.duration : DURATIONS[type];
        if (duration > 0) {
            toast._timer = setTimeout(function () { dismiss(toast); }, duration);
        }

        return toast;
    }

    function dismiss(toast) {
        if (!toast || !toast.parentNode) return;
        if (toast._timer) clearTimeout(toast._timer);
        toast.classList.remove('toast-visible');
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    function dismissAll() {
        var el = ensureContainer();
        var toasts = el.querySelectorAll('.toast-v2');
        for (var i = 0; i < toasts.length; i++) {
            dismiss(toasts[i]);
        }
    }

    var api = { show: show, dismiss: dismiss, dismissAll: dismissAll };

    if (window.App && window.App.register) {
        App.register('ToastManager', api);
    }
    window.ToastManager = api;
})();
