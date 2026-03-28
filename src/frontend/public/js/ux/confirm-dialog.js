/**
 * Confirm Dialog — Replaces native confirm() with accessible custom dialogs.
 * Danger type focuses Cancel by default to prevent accidental confirmation.
 * Uses FocusTrap for keyboard management.
 */
(function () {
    'use strict';

    var overlay = null;

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function buildDialog(type, title, message, confirmLabel, cancelLabel) {
        var dialog = document.createElement('div');
        dialog.className = 'confirm-dialog confirm-' + type;

        var header = document.createElement('div');
        header.className = 'confirm-header';

        var iconSpan = document.createElement('span');
        iconSpan.className = 'confirm-icon';
        iconSpan.textContent = type === 'danger' ? '🚨' : '⚠️';
        header.appendChild(iconSpan);

        var h3 = document.createElement('h3');
        h3.className = 'confirm-title';
        h3.textContent = title;
        header.appendChild(h3);
        dialog.appendChild(header);

        var msg = document.createElement('p');
        msg.className = 'confirm-message';
        msg.textContent = message;
        dialog.appendChild(msg);

        var actions = document.createElement('div');
        actions.className = 'confirm-actions';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'confirm-cancel-btn';
        cancelBtn.setAttribute('data-action', 'cancel');
        cancelBtn.textContent = cancelLabel;
        actions.appendChild(cancelBtn);

        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'confirm-ok-' + type;
        confirmBtn.setAttribute('data-action', 'confirm');
        confirmBtn.textContent = confirmLabel;
        actions.appendChild(confirmBtn);

        dialog.appendChild(actions);
        return dialog;
    }

    function createOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        document.body.appendChild(overlay);
        return overlay;
    }

    function show(opts) {
        opts = opts || {};
        var type = opts.type || 'warning';
        var title = opts.title || '確認操作';
        var message = opts.message || '';
        var confirmLabel = opts.confirmLabel || '確認';
        var cancelLabel = opts.cancelLabel || '取消';
        var onConfirm = opts.onConfirm || function () {};
        var onCancel = opts.onCancel || function () {};

        var el = createOverlay();
        el.setAttribute('aria-label', title);

        // Clear previous dialog content
        while (el.firstChild) el.removeChild(el.firstChild);

        var dialog = buildDialog(type, title, message, confirmLabel, cancelLabel);
        el.appendChild(dialog);

        el.style.display = 'flex';

        requestAnimationFrame(function () {
            el.classList.add('confirm-visible');
        });

        var cancelBtn = dialog.querySelector('[data-action="cancel"]');
        var confirmBtn = dialog.querySelector('[data-action="confirm"]');

        cancelBtn.onclick = function () {
            close();
            onCancel();
        };

        confirmBtn.onclick = function () {
            close();
            onConfirm();
        };

        // Danger type: focus Cancel to prevent accidental confirm
        var initialFocus = type === 'danger'
            ? '[data-action="cancel"]'
            : '[data-action="confirm"]';

        if (window.FocusTrap) {
            FocusTrap.activate(dialog, {
                initialFocus: initialFocus,
                onDeactivate: function () {
                    close();
                    onCancel();
                }
            });
        } else {
            var target = dialog.querySelector(initialFocus);
            if (target) target.focus();
        }
    }

    function close() {
        if (!overlay) return;
        if (window.FocusTrap && FocusTrap.isActive()) {
            FocusTrap.deactivate();
        }
        overlay.classList.remove('confirm-visible');
        setTimeout(function () {
            if (overlay) overlay.style.display = 'none';
        }, 200);
    }

    var api = { show: show, close: close };

    if (window.App && window.App.register) {
        App.register('ConfirmDialog', api);
    }
    window.ConfirmDialog = api;
})();
