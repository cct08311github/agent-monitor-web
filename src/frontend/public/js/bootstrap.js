(function () {
    function initThemeToggle() {
        if (typeof ThemeManager === 'undefined') return;
        console.log('ThemeManager detected, ensuring button connection');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (!themeBtn) return;
        themeBtn.removeAttribute('onclick');
        themeBtn.addEventListener('click', window.toggleTheme);
        console.log('Theme button reconnected programmatically');
    }

    function bindChatInput() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        chatInput.addEventListener('input', () => {
            updateCharCount();
            autoGrowTextarea(chatInput);
        });
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                sendChat();
            } else if (e.key === 'Enter' && isMobile) {
                e.preventDefault();
                sendChat();
            }
        });
    }

    function bindSreInput() {
        const sreInput = document.getElementById('sreInput');
        if (sreInput) sreInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendSREFollowUp(); });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        bindChatInput();
        bindSreInput();
        pushLog('OpenClaw Watch Pro v2.0.3 啟動（含 Watchdog）', 'info');
        update(true);
        initRealtime();
        startConnectionTimer();
        fetchHistory();
        fetchWatchdogStatus();
        setInterval(fetchHistory, 60000);
        setInterval(fetchWatchdogStatus, 15000);
        window.addEventListener('resize', () => setTimeout(updateCharts, 200));
        document.addEventListener('themechange', () => {
            if (currentDesktopTab === 'system') updateCharts();
        });
        initThemeToggle();
    });
})();
