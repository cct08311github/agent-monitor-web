(function () {
    function initRealtime() {
        pushLog('連接即時串流...', 'info');
        window.streamManager.connect('/api/read/stream', {
            autoReconnect: true,
            reconnectMs: 5000,
            onMessage(e) {
                try {
                    renderDashboard(JSON.parse(e.data));
                    lastSseTs = Date.now();
                    setConnDot('online');
                } catch (_) { }
            },
            events: {
                alert(e) {
                    try {
                        const { alerts } = JSON.parse(e.data);
                        alerts.forEach(a => {
                            const type = a.severity === 'critical' ? 'error' : (a.severity === 'warning' ? 'warning' : 'info');
                            showToast(`🚨 ${a.message}`, type);
                            pushLog(`[ALERT] ${a.message}`, a.severity === 'critical' ? 'err' : 'warn');
                        });
                        incrementAlertBadge(alerts.length);
                    } catch (_) { }
                }
            },
            onError() {
                pushLog('串流中斷，5s 後重連...', 'err');
                setConnDot('offline');
            }
        });
    }

    function setConnDot(state) {
        const dot = document.getElementById('connDot');
        if (!dot) return;
        dot.className = 'conn-dot conn-dot-' + state;
    }

    function startConnectionTimer() {
        if (_connTimerHandle) clearInterval(_connTimerHandle);
        _connTimerHandle = setInterval(() => {
            const dot = document.getElementById('connDot');
            if (!dot) return;
            if (lastSseTs === 0) { setConnDot('unknown'); return; }
            const sec = Math.floor((Date.now() - lastSseTs) / 1000);
            dot.title = sec < 60 ? `最後更新：${sec}s 前` : `最後更新：${Math.floor(sec / 60)}m 前`;
            if (sec > 60) setConnDot('offline');
        }, 1000);
    }

    window.initRealtime = initRealtime;
    window.setConnDot = setConnDot;
    window.startConnectionTimer = startConnectionTimer;
})();
