(function () {
    function showErrorBanner(msg) {
        if (dismissedErrorMap.has(msg)) return;

        const banner = document.getElementById('errorBanner');
        const ts = fmtTime();
        document.getElementById('errorBannerMsg').textContent = `[${ts}] ${msg}`;
        document.getElementById('errorBannerMsg').dataset.rawMsg = msg;
        banner.style.display = 'block';

        if (!lastErrors.find((entry) => entry.msg === msg)) {
            lastErrors.push({ msg, ts });
        }
    }

    function dismissError() {
        const banner = document.getElementById('errorBanner');
        const rawMsg = document.getElementById('errorBannerMsg').dataset.rawMsg;
        const now = Date.now();
        if (rawMsg) dismissedErrorMap.set(rawMsg, now);
        lastErrors.forEach((entry) => dismissedErrorMap.set(entry.msg, now));
        saveErrorKeys('oc_dismissed_errors', dismissedErrorMap);

        banner.style.display = 'none';
        lastErrors = [];
    }

    function handleErrorFix() {
        runCmd('restart');
    }

    function scrollToErrors() {
        switchDesktopTab('logs');
    }

    function getApiErrorMessage(error) {
        const payload = error && error.payload ? error.payload : null;
        let message = error && error.message ? error.message : 'Failed';
        if (payload && payload._debug_host) message += `\nHost: ${payload._debug_host}`;
        if (payload && payload._debug_origin) message += `\nOrigin: ${payload._debug_origin}`;
        return message;
    }

    async function sendErrorToSRE() {
        const rawMsg = document.getElementById('errorBannerMsg').dataset.rawMsg || document.getElementById('errorBannerMsg').textContent;
        if (!rawMsg) return;

        showToast('📨 正在發送錯誤報告給 SRE...', 'info');
        pushLog(`📨 發送錯誤報告給 SRE: ${rawMsg}`, 'info');

        const fullReport = [
            `[自動錯誤報告] ${fmtTime()}`,
            `錯誤: ${rawMsg}`,
            latestDashboard?.sys ? `系統: CPU ${latestDashboard.sys.cpu}%, MEM ${latestDashboard.sys.memory}%, DISK ${latestDashboard.sys.disk}%` : '',
            `Agents: ${latestDashboard?.agents?.length || 0} (執行中: ${latestDashboard?.agents?.filter(a => a.status?.includes('active')).length || 0})`,
            lastErrors.length > 1 ? `其他錯誤:\n${lastErrors.map((entry) => `- [${entry.ts}] ${entry.msg}`).join('\n')}` : '',
            '請診斷問題並提供修復建議。'
        ].filter(Boolean).join('\n');

        try {
            const data = await window.apiClient.post('/api/command', { command: 'talk', agentId: 'sre', message: fullReport });
            showToast('✅ 已通知 SRE，opening response...', 'success');
            pushLog('✅ SRE 已收到錯誤報告', 'info');
            showSREResponse(data.output || '(SRE 正在分析中...)');
        } catch (error) {
            showToast(`❌ 發送失敗: ${error.message}`, 'error');
            pushLog(`❌ SRE 通知失敗: ${error.message}`, 'err');
            showSREResponse(`❌ 通知失敗: ${error.message}\n\n如果是 forbidden_host，請確認伺服器已重新啟動。`);
        }
    }

    function showSREResponse(responseText) {
        const modal = document.getElementById('sreModal');
        const log = document.getElementById('sreLog');
        log.innerHTML = `<div class="sre-response-entry">
            <div class="sre-label">🛡️ SRE 回覆 — ${fmtTime()}</div>
            <div class="sre-content">${esc(responseText)}</div>
        </div>`;
        document.getElementById('sreInput').value = '';
        modal.style.display = 'flex';
    }

    async function sendSREFollowUp() {
        const input = document.getElementById('sreInput');
        const msg = input.value.trim();
        if (!msg || chatSending) return;
        chatSending = true;

        const log = document.getElementById('sreLog');
        log.innerHTML += `<div class="sre-response-entry user"><div class="sre-label">👤 你 — ${fmtTime()}</div><div class="sre-content">${esc(msg)}</div></div>`;
        input.value = '';
        log.scrollTop = log.scrollHeight;

        try {
            const data = await window.apiClient.post('/api/command', { command: 'talk', agentId: 'sre', message: msg });
            log.innerHTML += `<div class="sre-response-entry"><div class="sre-label">🛡️ SRE — ${fmtTime()}</div><div class="sre-content">${esc(data.output)}</div></div>`;
        } catch (error) {
            log.innerHTML += `<div class="sre-response-entry error"><div class="sre-content">❌ ${esc(error.message)}</div></div>`;
        }
        chatSending = false;
        log.scrollTop = log.scrollHeight;
    }

    function closeSREModal() {
        document.getElementById('sreModal').style.display = 'none';
    }

    window.showErrorBanner = showErrorBanner;
    window.dismissError = dismissError;
    window.handleErrorFix = handleErrorFix;
    window.scrollToErrors = scrollToErrors;
    window.getApiErrorMessage = getApiErrorMessage;
    window.sendErrorToSRE = sendErrorToSRE;
    window.showSREResponse = showSREResponse;
    window.sendSREFollowUp = sendSREFollowUp;
    window.closeSREModal = closeSREModal;
})();
