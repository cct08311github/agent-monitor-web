(function () {
    function confirmAndRun(cmd) {
        if (commandRunning) { showToast('⏳ 上一個指令還在執行中', 'info'); return; }

        if (cmd === 'restart') {
            if (window.ConfirmDialog) {
                ConfirmDialog.show({
                    type: 'warning',
                    title: '重啟 Gateway',
                    message: '所有 Agent 連線會暫時中斷，確認重啟？',
                    confirmLabel: '重啟',
                    onConfirm: function () { executeCmd(cmd); }
                });
            } else if (confirm('⚠️ 確認重啟 Gateway？所有 Agent 連線會暫時中斷。')) {
                executeCmd(cmd);
            }
            return;
        }

        if (cmd === 'update') {
            if (window.ConfirmDialog) {
                ConfirmDialog.show({
                    type: 'danger',
                    title: '系統更新',
                    message: '執行系統更新將暫停所有服務，確認執行？',
                    confirmLabel: '更新',
                    onConfirm: function () { executeCmd(cmd); }
                });
            } else if (confirm('⚠️ 確認更新 OpenClaw？服務會暫停。')) {
                executeCmd(cmd);
            }
            return;
        }

        executeCmd(cmd);
    }

    async function executeCmd(cmd) {
        commandRunning = true;
        pushLog(`▶ 執行: ${cmd}`, 'info');
        showToast(`正在執行 ${cmd}...`, 'info');
        var cmdBtns = document.querySelectorAll('.cmd-btn');
        cmdBtns.forEach(function (button) { button.disabled = true; });

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
            showToast(`❌ ${message}`, 'error', { retryFn: function () { confirmAndRun(cmd); } });
        } finally {
            commandRunning = false;
            cmdBtns.forEach(function (button) { button.disabled = false; });
        }
    }

    async function runCmd(cmd) {
        confirmAndRun(cmd);
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
