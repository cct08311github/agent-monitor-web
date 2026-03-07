(function () {
    function connect(url, options) {
        const settings = options || {};
        let source = null;
        let closed = false;
        let reconnectTimer = null;

        function clearReconnect() {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        }

        function scheduleReconnect() {
            if (closed || !settings.autoReconnect) return;
            clearReconnect();
            reconnectTimer = setTimeout(start, settings.reconnectMs || 5000);
        }

        function start() {
            source = new EventSource(url);

            if (typeof settings.onOpen === 'function') {
                source.onopen = () => settings.onOpen(source);
            }

            if (typeof settings.onMessage === 'function') {
                source.onmessage = (event) => settings.onMessage(event, source);
            }

            if (settings.events) {
                Object.entries(settings.events).forEach(([eventName, handler]) => {
                    source.addEventListener(eventName, (event) => handler(event, source));
                });
            }

            source.onerror = (event) => {
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

        start();

        return {
            close,
            getSource() {
                return source;
            }
        };
    }

    window.streamManager = { connect };
})();
