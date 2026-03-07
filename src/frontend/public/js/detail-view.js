(function () {
    function showAgentDetail(agentId) {
        const data = latestDashboard;
        if (!data) return;
        _currentDetailAgentId = agentId;
        const range = document.getElementById('costRange')?.value || 'month';
        const agent = data.agents.find(a => a.id === agentId);
        if (!agent) return;
        const si = getStatusInfo(agent.status);
        const agentPeriodCost = (range === 'all' ? (agent.costs?.total ?? agent.cost ?? 0) : (agent.costs?.[range] ?? agent.cost ?? 0));
        const costTWD = formatTWD(parseFloat(agentPeriodCost));
        const muHtml = Object.entries(agent.modelUsage || {}).sort((a, b) => b[1].cost - a[1].cost)
            .map(([m, u]) => `<div class="model-usage-item"><div><span class="model-usage-name">${esc(m)}</span><span class="model-usage-sessions">(${u.sessions})</span></div><div class="model-usage-stats"><div class="model-usage-tokens">${formatTokens(u.total)}</div><div class="model-usage-cost">${formatTWD(u.cost)}</div></div></div>`).join('');
        document.getElementById('detailContent').innerHTML = `
        <div class="detail-card"><div class="detail-card-title">基本資訊</div>
        <div class="detail-row"><span class="detail-row-label">Agent</span><span class="detail-row-value">${esc(agent.id)}</span></div>
        <div class="detail-row"><span class="detail-row-label">狀態</span><span class="detail-row-value agent-status ${si.dotClass}"><span class="agent-status-dot"></span> ${si.text}</span></div>
        <div class="detail-row"><span class="detail-row-label">模型</span><span class="detail-row-value">${esc(agent.model || 'N/A')}</span></div>
        <div class="detail-row"><span class="detail-row-label">最後活動</span><span class="detail-row-value">${esc(agent.lastActivity || 'never')}</span></div>
        <div class="detail-row"><span class="detail-row-label">費用</span><span class="detail-row-value" style="color:var(--green)">${costTWD}</span></div></div>
        <div class="detail-card"><div class="detail-card-title">Token</div>
        <div class="detail-row"><span class="detail-row-label">Input</span><span class="detail-row-value">${formatTokens(agent.tokens?.input)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Output</span><span class="detail-row-value">${formatTokens(agent.tokens?.output)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Cache</span><span class="detail-row-value">${formatTokens(agent.tokens?.cacheRead)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Total</span><span class="detail-row-value">${formatTokens(agent.tokens?.total)}</span></div></div>
        ${muHtml ? `<div class="detail-card"><div class="detail-card-title">模型明細</div>${muHtml}</div>` : ''}
        <div class="detail-card"><div class="detail-card-title">目前任務</div><div class="detail-task-content">${esc(agent.currentTask?.task || '無')}</div></div>
        <div style="display:flex;gap:8px;margin-top:12px">
            <button class="ctrl-btn accent" style="flex:1" onclick="openChat('${esc(agent.id)}')">💬 對話</button>
            <button class="ctrl-btn" style="flex:1" onclick="openModelModal('${esc(agent.id)}', '${esc(agent.model || '')}')">🔄 切換模型</button>
        </div>
        <div class="detail-card"><div class="detail-card-title">Sessions</div><div id="sessionListBody" style="color:var(--text-muted);font-size:12px;padding:4px 0">載入中…</div></div>`;
        switchDesktopTab('detail');
        loadSessionList(agentId);
    }

    function loadSessionList(agentId) {
        window.apiClient.get(`/api/agents/${encodeURIComponent(agentId)}/sessions`)
            .then(d => {
                const body = document.getElementById('sessionListBody');
                if (!body) return;
                while (body.firstChild) body.removeChild(body.firstChild);
                const sessions = d.success && d.sessions ? d.sessions : [];
                if (sessions.length === 0) {
                    const empty = document.createElement('div');
                    empty.textContent = '無 session 記錄';
                    empty.style.cssText = 'color:var(--text-muted);font-size:12px';
                    body.appendChild(empty);
                    return;
                }
                sessions.forEach(s => {
                    const row = document.createElement('div');
                    row.className = 'detail-row';
                    row.style.cssText = 'cursor:pointer;border-radius:4px;padding:2px 4px;margin:-2px -4px';
                    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-muted)');
                    row.addEventListener('mouseleave', () => row.style.background = '');
                    row.addEventListener('click', () => openSessionView(_currentDetailAgentId, s.id));
                    const label = document.createElement('span');
                    label.className = 'detail-row-label';
                    label.style.cssText = 'font-family:monospace;font-size:11px';
                    label.textContent = s.id.slice(-16);
                    const val = document.createElement('span');
                    val.className = 'detail-row-value';
                    val.style.cssText = 'color:var(--text-muted);font-size:11px';
                    val.textContent = `${s.messageCount} 則${s.lastTs ? ' · ' + s.lastTs.slice(0, 10) : ''}`;
                    row.appendChild(label);
                    row.appendChild(val);
                    body.appendChild(row);
                });
            })
            .catch(() => {
                const body = document.getElementById('sessionListBody');
                if (body) body.textContent = '載入失敗';
            });
    }

    function closeSessionView() {
        const m = document.getElementById('sessionViewModal');
        if (m) m.style.display = 'none';
    }

    function openSessionView(agentId, sessionId) {
        const modal = document.getElementById('sessionViewModal');
        const body = document.getElementById('sessionViewBody');
        const title = document.getElementById('sessionViewTitle');
        if (!modal || !body) return;

        title.textContent = `💬 ${sessionId.slice(-12)}`;
        body.textContent = '載入中…';
        modal.style.display = 'flex';

        window.apiClient.get(`/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`)
            .then(d => {
                while (body.firstChild) body.removeChild(body.firstChild);
                if (!d.success || !d.messages || d.messages.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'color:var(--text-muted);padding:16px;text-align:center';
                    empty.textContent = '無訊息記錄';
                    body.appendChild(empty);
                    return;
                }
                d.messages.forEach(msg => {
                    const bubble = document.createElement('div');
                    const isUser = msg.role === 'user';
                    bubble.style.cssText = `margin-bottom:10px;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;max-width:90%;${isUser ? 'margin-left:auto;background:var(--blue);color:#fff;' : 'background:var(--bg-muted);color:var(--text-primary);'}`;
                    const roleLabel = document.createElement('div');
                    roleLabel.style.cssText = 'font-size:10px;font-weight:600;margin-bottom:4px;opacity:0.7';
                    roleLabel.textContent = msg.role.toUpperCase();
                    bubble.appendChild(roleLabel);
                    if (msg.text) {
                        const textEl = document.createElement('div');
                        textEl.style.cssText = 'white-space:pre-wrap;word-break:break-word';
                        textEl.textContent = msg.text.slice(0, 2000) + (msg.text.length > 2000 ? '\n…（已截斷）' : '');
                        bubble.appendChild(textEl);
                    }
                    if (msg.toolUses && msg.toolUses.length > 0) {
                        const tools = document.createElement('div');
                        tools.style.cssText = 'margin-top:4px;font-size:11px;opacity:0.75;font-family:monospace';
                        tools.textContent = '🔧 ' + msg.toolUses.join(', ');
                        bubble.appendChild(tools);
                    }
                    body.appendChild(bubble);
                });
            })
            .catch(() => { body.textContent = '載入失敗'; });
    }

    function renderAgentActivityBanner(agentActivity) {
        const el = document.getElementById('agentActivityBanner');
        if (!el || !agentActivity?.length) return;
        const total = agentActivity.length;
        const active = agentActivity.filter(a => a.active_minutes > 0).length;
        const lastSeen = agentActivity.reduce((max, a) => (a.last_seen > max ? a.last_seen : max), '');
        el.textContent = `過去 24h：${total} 個 Agent，${active} 個曾活躍｜最後活動：${lastSeen ? lastSeen.slice(11, 16) : '-'}`;
    }

    window.showAgentDetail = showAgentDetail;
    window.loadSessionList = loadSessionList;
    window.closeSessionView = closeSessionView;
    window.openSessionView = openSessionView;
    window.renderAgentActivityBanner = renderAgentActivityBanner;
})();
