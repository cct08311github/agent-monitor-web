/**
 * Error Boundary - Global JavaScript error handling
 * Catches unhandled errors and unhandled promise rejections
 * Provides user-friendly error display via Toast
 */
(function () {
    'use strict';

    var isEnabled = true;

    /**
     * Handle uncaught errors
     * @param {string} msg - Error message
     * @param {string} url - Script URL where error occurred
     * @param {number} line - Line number
     * @param {number} col - Column number
     * @param {Error} error - Error object (if available)
     */
    function onError(msg, url, line, col, error) {
        if (!isEnabled) return;

        // Ignore certain benign errors
        if (msg === 'ResizeObserver loop limit exceeded') return;
        if (msg && msg.includes('Non-Error promise rejection')) return;

        var errorInfo = {
            message: msg,
            url: url,
            line: line,
            col: col,
            stack: error && error.stack,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
        };

        // Show user-friendly toast
        var displayMsg = msg || 'An unexpected error occurred';
        if (displayMsg.length > 100) {
            displayMsg = displayMsg.substring(0, 100) + '...';
        }

        showToast('❌ ' + displayMsg, 'error', {
            duration: 0, // Errors persist until dismissed
            retryFn: function() {
                // Attempt to reload the page on retry
                window.location.reload();
            }
        });

        // Return true to prevent default browser handling
        return true;
    }

    /**
     * Handle unhandled promise rejections
     * @param {PromiseRejectionEvent} event
     */
    function onUnhandledRejection(event) {
        if (!isEnabled) return;

        var reason = event.reason;
        var message = 'Unhandled Promise Rejection';

        if (reason instanceof Error) {
            message = reason.message || message;
        } else if (typeof reason === 'string') {
            message = reason;
        } else if (reason && reason.message) {
            message = reason.message;
        }

        showToast('❌ ' + message, 'error', {
            duration: 0,
        });
    }

    /**
     * Enable/disable error boundary
     * @param {boolean} enabled
     */
    function setEnabled(enabled) {
        isEnabled = !!enabled;
    }

    // Register error handlers
    if (typeof window !== 'undefined') {
        window.addEventListener('error', function(event) {
            return onError(event.message, event.filename, event.lineno, event.colno, event.error);
        });
        window.addEventListener('unhandledrejection', onUnhandledRejection);
    }

    // Export API
    var api = {
        onError: onError,
        onUnhandledRejection: onUnhandledRejection,
        setEnabled: setEnabled,
    };

    if (window.App && window.App.register) {
        App.register('ErrorBoundary', api);
    }
    window.ErrorBoundary = api;
})();
