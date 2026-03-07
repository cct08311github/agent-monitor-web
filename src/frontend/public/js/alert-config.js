(function () {
    function incrementAlertBadge(n) {
        unreadAlertCount += n;
        const badge = document.getElementById('p0AlertBadge');
        if (badge) { badge.textContent = unreadAlertCount; badge.style.display = 'inline-block'; }
    }

    function clearAlertBadge() {
        unreadAlertCount = 0;
        const badge = document.getElementById('p0AlertBadge');
        if (badge) badge.style.display = 'none';
    }

    async function openAlertConfig() {
        clearAlertBadge();
        try {
            const { config } = await window.apiClient.get('/api/alerts/config');
            _alertConfigCache = config;
            const modal = document.getElementById('alertConfigModal');
            const tbody = document.getElementById('alertConfigBody');

            tbody.textContent = '';
            for (const [rule, r] of Object.entries(config.rules)) {
                const tr = document.createElement('tr');

                const tdLabel = document.createElement('td');
                tdLabel.textContent = r.label;

                const tdThr = document.createElement('td');
                const inp = document.createElement('input');
                inp.type = 'number'; inp.id = `thr_${rule}`; inp.value = r.threshold;
                inp.min = 0; inp.max = 100; inp.style.width = '60px';
                tdThr.appendChild(inp);

                const tdSev = document.createElement('td');
                const pill = document.createElement('span');
                pill.className = `alert-severity ${r.severity}`;
                pill.textContent = r.severity;
                tdSev.appendChild(pill);

                const tdEn = document.createElement('td');
                const lbl = document.createElement('label');
                lbl.className = 'toggle-switch';
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.id = `en_${rule}`; cb.checked = r.enabled;
                const slider = document.createElement('span');
                slider.className = 'toggle-slider';
                lbl.appendChild(cb); lbl.appendChild(slider);
                tdEn.appendChild(lbl);

                tr.appendChild(tdLabel); tr.appendChild(tdThr);
                tr.appendChild(tdSev); tr.appendChild(tdEn);
                tbody.appendChild(tr);
            }
            modal.style.display = 'flex';
        } catch (e) { showToast('載入設定失敗', 'error'); }
    }

    function closeAlertConfig() {
        const modal = document.getElementById('alertConfigModal');
        if (modal) modal.style.display = 'none';
    }

    async function saveAlertConfig() {
        if (!_alertConfigCache) { showToast('請先開啟設定', 'error'); return; }
        try {
            const patch = { rules: {} };
            for (const rule of Object.keys(_alertConfigCache.rules)) {
                patch.rules[rule] = {
                    threshold: (() => {
                        const v = document.getElementById(`thr_${rule}`)?.value;
                        return (v !== undefined && v !== '') ? parseFloat(v) : _alertConfigCache.rules[rule].threshold;
                    })(),
                    enabled: document.getElementById(`en_${rule}`)?.checked ?? _alertConfigCache.rules[rule].enabled,
                };
            }
            await window.apiClient.patch('/api/alerts/config', patch);
            showToast('✅ 警報設定已儲存', 'success');
            closeAlertConfig();
        } catch (e) { showToast('儲存失敗', 'error'); }
    }

    function detectErrors(data) {
        if (!data) return;
        const newErrors = [];
        if (data.sys && data.sys.cpu > 95) newErrors.push({ msg: 'CPU 使用率超過 95%，系統可能過載', key: 'cpu_high' });
        if (data.sys && data.sys.memory > 98) newErrors.push({ msg: '記憶體使用率超過 98%，建議重啟不必要的服務', key: 'mem_high' });
        const subagents = data.subagents || [];
        const aborted = subagents.filter(s => s.abortedLastRun);
        if (aborted.length > 0) {
            const fingerprint = 'aborted:' + aborted.map(s => s.subagentId).sort().join(',');
            newErrors.push({ msg: `${aborted.length} 個 Sub-Agent 上次執行時被中斷`, key: fingerprint });
        }

        const fresh = newErrors.filter(e => !dismissedErrorMap.has(e.key) && !shownErrorMap.has(e.key));
        if (fresh.length > 0) {
            showErrorBanner(fresh[0].msg);
            const now = Date.now();
            fresh.forEach(e => shownErrorMap.set(e.key, now));
            saveErrorKeys('oc_shown_errors', shownErrorMap);
            fresh.slice(1).forEach(e => {
                if (!lastErrors.find(le => le.msg === e.msg)) {
                    lastErrors.push({ msg: e.msg, ts: fmtTime() });
                }
            });
        }
    }

    window.incrementAlertBadge = incrementAlertBadge;
    window.clearAlertBadge = clearAlertBadge;
    window.openAlertConfig = openAlertConfig;
    window.closeAlertConfig = closeAlertConfig;
    window.saveAlertConfig = saveAlertConfig;
    window.detectErrors = detectErrors;
})();
