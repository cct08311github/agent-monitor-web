(function () {
    async function fetchWatchdogStatus() {
        try {
            const data = await window.apiClient.get('/api/watchdog/status');
            if (data.success && data.watchdog) renderWatchdogStatus(data.watchdog);
        } catch (e) { }
    }

    function renderWatchdogStatus(wd) {
        const indicator = document.getElementById('watchdogIndicator');
        const stateText = document.getElementById('watchdogStateText');
        const toggle = document.getElementById('watchdogToggle');
        const stats = document.getElementById('watchdogStats');
        const history = document.getElementById('watchdogHistory');

        if (!indicator) return;

        const statusMap = {
            healthy: { text: '✅ 正常運作', css: 'healthy' },
            degraded: { text: '⚠️ 部分異常', css: 'degraded' },
            down: { text: '🔴 Gateway 異常', css: 'down' },
            repairing: { text: '🔧 修復中...', css: 'repairing' },
            escalated: { text: '🚨 需人工介入', css: 'escalated' },
            unknown: { text: '⏳ 檢查中...', css: '' },
        };
        const st = statusMap[wd.currentStatus] || statusMap.unknown;
        if (!wd.isRunning) { st.text = '⏸ 已暫停'; st.css = 'stopped'; }

        indicator.className = `watchdog-indicator ${st.css}`;
        stateText.textContent = st.text;
        toggle.checked = wd.isRunning;

        stats.innerHTML = `
        <div class="watchdog-stat"><span class="watchdog-stat-label">最後正常</span><span class="watchdog-stat-value">${wd.lastHealthy || '-'}</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">連續失敗</span><span class="watchdog-stat-value">${wd.consecutiveFailures}</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">已修復</span><span class="watchdog-stat-value">${wd.totalRepairs} 次</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">告警</span><span class="watchdog-stat-value">${wd.totalAlerts} 次</span></div>
    `;

        const recentEvents = (wd.events || []).slice(-8).reverse();
        history.innerHTML = recentEvents.length ? recentEvents.map(e => {
            const lvl = e.level === 'err' ? 'color:var(--red)' : (e.level === 'warn' ? 'color:var(--orange)' : '');
            return `<div class="watchdog-event"><span class="watchdog-event-ts">${(e.tsLocal || '').slice(11)}</span><span class="watchdog-event-msg" style="${lvl}">${esc(e.msg)}</span></div>`;
        }).join('') : '<div style="font-size:11px;color:var(--text-muted);padding:4px">暫無事件</div>';
    }

    async function toggleWatchdog(enabled) {
        showToast(enabled ? '🐕 啟動 Watchdog...' : '⏸ 暫停 Watchdog...', 'info');
        try {
            const data = await window.apiClient.post('/api/watchdog/toggle', { enabled });
            if (data.success) {
                renderWatchdogStatus(data.watchdog);
                showToast(enabled ? '✅ Watchdog 已啟動' : '⏸ Watchdog 已暫停', 'success');
                pushLog(enabled ? '🐕 Watchdog 啟動' : '⏸ Watchdog 暫停', 'info');
            }
        } catch (e) {
            showToast(`❌ 操作失敗: ${e.message}`, 'error');
        }
    }

    async function manualRepair() {
        if (!confirm('⚠️ 確認手動觸發 Gateway 修復？')) return;
        showToast('🔧 正在手動修復 Gateway...', 'info');
        pushLog('🔧 手動觸發 Gateway 修復', 'warn');
        try {
            const data = await window.apiClient.post('/api/watchdog/repair');
            if (data.success) {
                showToast(data.repaired ? '✅ Gateway 修復成功！' : '❌ 修復失敗，需人工介入', data.repaired ? 'success' : 'error');
                pushLog(data.repaired ? '✅ 手動修復成功' : '❌ 手動修復失敗', data.repaired ? 'info' : 'err');
            } else {
                throw new Error(data.error || 'Repair failed');
            }
        } catch (e) {
            showToast(`❌ 修復失敗: ${e.message}`, 'error');
            pushLog(`❌ 手動修復失敗: ${e.message}`, 'err');
        }
        fetchWatchdogStatus();
    }

    window.fetchWatchdogStatus = fetchWatchdogStatus;
    window.renderWatchdogStatus = renderWatchdogStatus;
    window.toggleWatchdog = toggleWatchdog;
    window.manualRepair = manualRepair;
})();
