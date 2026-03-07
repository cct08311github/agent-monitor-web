(function () {
    async function runCmd(cmd) {
        if (commandRunning) { showToast('⏳ 上一個指令還在執行中', 'info'); return; }
        if (cmd === 'restart' && !confirm('⚠️ 確認重啟 Gateway？所有 Agent 連線會暫時中斷。')) return;
        if (cmd === 'update') {
            if (!confirm('⚠️ 確認更新 OpenClaw？服務會暫停。')) return;
            if (!confirm('⚠️ 再次確認：執行系統更新？')) return;
        }

        commandRunning = true;
        pushLog(`▶ 執行: ${cmd}`, 'info');
        showToast(`正在執行 ${cmd}...`, 'info');
        document.querySelectorAll('.cmd-btn').forEach((button) => { button.disabled = true; });

        try {
            let request;
            if (['status', 'models', 'agents'].includes(cmd)) {
                request = window.apiClient.get(`/api/read/${cmd}`);
            } else {
                request = window.apiClient.post('/api/command', { command: cmd });
            }
            const data = await request;
            pushLog(`✅ [${cmd.toUpperCase()}] 完成`, 'info');
            if (['status', 'models', 'agents'].includes(cmd)) {
                showCmdOutput(`📋 ${cmd.toUpperCase()}`, data.output || JSON.stringify(data, null, 2));
            } else {
                showToast(`✅ ${cmd} 完成`, 'success');
            }
        } catch (error) {
            const message = getApiErrorMessage(error);
            pushLog(`❌ ${cmd} 失敗: ${message}`, 'err');
            showToast(`❌ ${message}`, 'error');
        } finally {
            commandRunning = false;
            document.querySelectorAll('.cmd-btn').forEach((button) => { button.disabled = false; });
        }
    }

    function showCmdOutput(title, content) {
        document.getElementById('cmdOutputTitle').textContent = title;
        document.getElementById('cmdOutputContent').textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        document.getElementById('cmdOutputModal').style.display = 'flex';
    }

    function closeCmdOutput() {
        document.getElementById('cmdOutputModal').style.display = 'none';
    }

    window.runCmd = runCmd;
    window.showCmdOutput = showCmdOutput;
    window.closeCmdOutput = closeCmdOutput;
})();
