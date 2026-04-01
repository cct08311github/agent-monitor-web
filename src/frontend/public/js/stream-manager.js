(function () {
    var BASE_DELAY = 1000;
    var MAX_DELAY = 15000;
    var JITTER_FACTOR = 0.2;

    function backoffDelay(attempt) {
        var delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
        var jitter = delay * JITTER_FACTOR * (Math.random() * 2 - 1);
        return Math.round(delay + jitter);
    }

    function connect(url, options) {
        var settings = options || {};
        var source = null;
        var closed = false;
        var reconnectTimer = null;
        var attempt = 0;
        var pausedByVisibility = false;

        function clearReconnect() {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        }

        function scheduleReconnect() {
            if (closed || !settings.autoReconnect) return;
            clearReconnect();
            var delay = backoffDelay(attempt);
            attempt++;
            if (typeof settings.onReconnecting === 'function') {
                settings.onReconnecting(attempt, delay);
            }
            reconnectTimer = setTimeout(start, delay);
        }

        function start() {
            if (closed) return;
            var base = window.__BASE_PATH || '';
            var fullUrl = (base && url.startsWith('/')) ? base + url : url;
            source = new EventSource(fullUrl);

            if (typeof settings.onOpen === 'function') {
                source.onopen = function () {
                    attempt = 0;
                    settings.onOpen(source);
                };
            } else {
                source.onopen = function () { attempt = 0; };
            }

            if (typeof settings.onMessage === 'function') {
                source.onmessage = function (event) { settings.onMessage(event, source); };
            }

            if (settings.events) {
                Object.entries(settings.events).forEach(function (entry) {
                    source.addEventListener(entry[0], function (event) { entry[1](event, source); });
                });
            }

            source.onerror = function (event) {
                if (typeof settings.onError === 'function') {
                    settings.onError(event, source);
                }
                if (settings.autoReconnect) {
                    try { source.close(); } catch (_) { }
                    scheduleReconnect();
                }
            };
        }

        function close() {
            closed = true;
            clearReconnect();
            if (source) {
                try { source.close(); } catch (_) { }
                source = null;
            }
        }

        // Page Visibility API: pause when hidden, reconnect when visible
        if (typeof document !== 'undefined' && settings.autoReconnect !== false) {
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    if (source && source.readyState !== 2) {
                        pausedByVisibility = true;
                        try { source.close(); } catch (_) { }
                        clearReconnect();
                    }
                } else if (pausedByVisibility && !closed) {
                    pausedByVisibility = false;
                    attempt = 0;
                    start();
                }
            });
        }

        start();

        return {
            close: close,
            getSource: function () { return source; }
        };
    }

    var api = { connect: connect };
    if (window.App && window.App.register) {
        App.register('StreamManager', api);
    }
    window.streamManager = api;
})();
