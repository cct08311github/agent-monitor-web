(function () {
    function switchDesktopTab(tab) {
        currentDesktopTab = tab;
        document.querySelectorAll('.dtab-page:not(.chat-tab-page)').forEach(p => p.classList.remove('active'));
        const chatPage = document.getElementById('dtabChat');
        if (chatPage) chatPage.classList.toggle('active-tab', tab === 'chat');

        const pageId = { monitor: 'dtabMonitor', system: 'dtabSystem', logs: 'dtabLogs', detail: 'dtabDetail' }[tab];
        if (pageId) document.getElementById(pageId).classList.add('active');
        document.querySelectorAll('.desktop-tab').forEach(t => {
            var isActive = t.dataset.dtab === tab;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === tab));
        if (tab === 'system') { setTimeout(updateCharts, 100); setTimeout(updateCostDisplay, 150); }
        if (tab === 'chat') initChatPage();
        updateSummaryCards(tab);
    }

    function switchSubTab(tab) {
        currentSubTab = tab;
        document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.dataset.subtab === tab));
        document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
        const contentId = { agents: 'subTabAgents', subagents: 'subTabSubagents', cron: 'subTabCron', taskhub: 'subTabTaskhub' }[tab];
        if (contentId) document.getElementById(contentId).classList.add('active');
        if (tab === 'cron') fetchCronJobs();
        if (tab === 'taskhub') { fetchTaskhubStats(); fetchTasks(); }
    }

    function updateSummaryCards(tab) {
        const section = document.getElementById('summarySection');
        if (!section) return;
        if (tab === 'chat') { section.style.display = 'none'; return; }
        section.style.display = '';

        function setSlot(n, label, icon, iconCls) {
            const lbl = document.getElementById('sc' + n + 'Label');
            const ico = document.getElementById('sc' + n + 'Icon');
            if (lbl) lbl.textContent = label;
            if (ico) { ico.textContent = icon; ico.className = 'summary-icon ' + iconCls; }
        }

        const sys = latestDashboard?.sys || {};

        if (tab === 'monitor') {
            setSlot(1, '總 Agents', '🤖', 'blue');
            setSlot(2, '執行中', '🟢', 'green');
            setSlot(3, 'Sub-Agents', '🔗', 'orange');
            setSlot(4, '本月費用', '💰', 'purple');
        } else if (tab === 'system') {
            setSlot(1, 'CPU', '💻', 'blue');
            setSlot(2, '記憶體', '🧠', 'green');
            setSlot(3, '磁碟', '💾', 'orange');
            setSlot(4, '本月費用', '💰', 'purple');
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            set('totalAgents', (sys.cpu || 0) + '%');
            set('activeAgents', (sys.memory || 0) + '%');
            set('totalSubagents', (sys.disk || 0) + '%');
        } else if (tab === 'logs') {
            setSlot(1, 'OC 版本', '📦', 'blue');
            setSlot(2, 'Watchdog', '🐕', 'green');
            setSlot(3, '本月費用', '💰', 'orange');
            setSlot(4, 'Sub-Agents', '🔗', 'purple');
            const ver = document.getElementById('openclawVersion')?.textContent || '-';
            const wd = document.getElementById('watchdogStateText')?.textContent || '-';
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            set('totalAgents', ver);
            set('activeAgents', wd);
        }
    }

    window.switchDesktopTab = switchDesktopTab;
    window.switchSubTab = switchSubTab;
    window.updateSummaryCards = updateSummaryCards;
})();
