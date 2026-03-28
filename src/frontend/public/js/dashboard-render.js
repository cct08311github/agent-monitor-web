(function () {
    function renderModelUsage(listId, summaryId, agents) {
        const range = document.getElementById('costRange')?.value || 'month';
        const allModelUsage = {};
        let totalCost = 0;

        agents.forEach(a => {
            const agentPeriodCost = (range === 'all' ? (a.costs?.total ?? a.cost ?? 0) : (a.costs?.[range] ?? a.cost ?? 0));
            totalCost += parseFloat(agentPeriodCost);

            if (a.modelUsage) {
                Object.entries(a.modelUsage).forEach(([model, u]) => {
                    if (!allModelUsage[model]) allModelUsage[model] = { total: 0, cost: 0, sessions: 0 };
                    allModelUsage[model].total += u.total;
                    allModelUsage[model].cost += u.cost;
                    allModelUsage[model].sessions += u.sessions;
                });
            }
        });
        const listEl = document.getElementById(listId);
        if (listEl) {
            const sorted = Object.entries(allModelUsage).sort((a, b) => b[1].cost - a[1].cost);
            const maxCost = sorted.length > 0 ? (sorted[0][1].cost || 0.000001) : 0.000001;
            listEl.innerHTML = sorted
                .map(([model, u]) => {
                    const pct = Math.round((u.cost / maxCost) * 100);
                    return `<div class="model-usage-item"><div><span class="model-usage-name">${esc(model)}</span><span class="model-usage-sessions">(${u.sessions})</span></div><div class="model-usage-bar" style="height:3px;border-radius:2px;background:var(--border);margin:3px 0"><div style="width:${pct}%;height:100%;border-radius:2px;background:var(--blue)"></div></div><div class="model-usage-stats"><div class="model-usage-tokens">${formatTokens(u.total)}</div><div class="model-usage-cost">${formatTWD(u.cost)}</div></div></div>`;
                }).join('')
                || '<div style="color:var(--text-muted);padding:8px;font-size:12px;">尚無資料</div>';
        }
        const summaryEl = document.getElementById(summaryId);
        if (summaryEl) summaryEl.innerHTML = `<span class="cost-summary-label">總計</span><span class="cost-summary-value">${formatTWD(totalCost)}</span>`;
    }

    function buildAgentCardEl(a, cost) {
        const si = getStatusInfo(a.status);
        const card = document.createElement('div');
        card.className = 'agent-card ' + si.class;
        card.addEventListener('click', () => showAgentDetail(a.id));

        const hdr = document.createElement('div');
        hdr.className = 'agent-card-header';
        const nameWrap = document.createElement('div');
        nameWrap.className = 'agent-card-name';
        const av = document.createElement('div');
        av.className = 'agent-avatar';
        av.textContent = getAgentEmoji(a.id);
        const nameInfo = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'agent-name';
        nameEl.textContent = a.id;
        const mdl = document.createElement('div');
        mdl.className = 'agent-hostname';
        mdl.textContent = a.model || 'N/A';
        nameInfo.append(nameEl, mdl);
        nameWrap.append(av, nameInfo);
        const statusEl = document.createElement('div');
        statusEl.className = 'agent-status ' + si.dotClass;
        statusEl.setAttribute('role', 'status');
        statusEl.setAttribute('aria-label', '狀態: ' + si.text);
        const statusIcon = document.createElement('span');
        statusIcon.className = 'status-icon';
        statusIcon.textContent = si.icon || '●';
        statusIcon.setAttribute('aria-hidden', 'true');
        const dot = document.createElement('span');
        dot.className = 'agent-status-dot';
        dot.setAttribute('aria-hidden', 'true');
        statusEl.append(statusIcon, dot, document.createTextNode(' ' + si.text));
        hdr.append(nameWrap, statusEl);

        const body = document.createElement('div');
        body.className = 'agent-card-body';
        function infoRow(lbl, val) {
            const row = document.createElement('div');
            row.className = 'agent-info-row';
            const l = document.createElement('span');
            l.className = 'agent-info-label';
            l.textContent = lbl;
            const v = document.createElement('span');
            v.className = 'agent-info-value';
            v.textContent = val;
            row.append(l, v);
            return row;
        }
        body.append(
            infoRow('費用', formatTWD(cost)),
            infoRow('Tokens', formatTokens(a.tokens?.total)),
            infoRow('活動', a.lastActivity || '-'),
        );

        const taskText = a.currentTask?.task || '';
        const isExec = a.currentTask?.label === 'EXECUTING';
        if (taskText) {
            const preview = document.createElement('div');
            preview.className = 'agent-task-preview';
            const taskHdr = document.createElement('div');
            taskHdr.className = 'agent-task-header';
            const lbl = document.createElement('span');
            lbl.className = 'agent-task-label ' + (isExec ? 'executing' : 'idle');
            if (isExec) { const p = document.createElement('span'); p.className = 'task-pulse'; lbl.appendChild(p); }
            lbl.append(document.createTextNode(isExec ? '執行中' : '💤 閒置'));
            taskHdr.appendChild(lbl);
            const content = document.createElement('div');
            content.className = 'agent-task-content';
            content.title = taskText;
            content.textContent = taskText;
            preview.append(taskHdr, content);
            body.appendChild(preview);
        }

        const actions = document.createElement('div');
        actions.className = 'agent-card-actions';
        actions.addEventListener('click', e => e.stopPropagation());
        const chatBtn = document.createElement('button');
        chatBtn.className = 'agent-action-btn';
        chatBtn.textContent = '💬 對話';
        chatBtn.addEventListener('click', () => openChat(a.id));
        const mdlBtn = document.createElement('button');
        mdlBtn.className = 'agent-action-btn';
        mdlBtn.textContent = '🔄 模型';
        mdlBtn.addEventListener('click', () => openModelModal(a.id, a.model || ''));
        actions.append(chatBtn, mdlBtn);

        card.append(hdr, body, actions);
        return card;
    }

    function renderDashboard(data) {
        if (!data || !data.success) return;
        latestDashboard = data;
        if (data.exchangeRate) currentExchangeRate = data.exchangeRate;
        const verEl = document.getElementById('openclawVersion');
        if (verEl) verEl.textContent = data.openclaw?.version || 'unknown';
        const range = document.getElementById('costRange')?.value || 'month';
        const agents = data.agents || [];
        let totalCost = 0;
        let activeCount = 0;

        agents.forEach(a => {
            const prev = previousAgentsMap[a.id];
            if (!prev && a.status?.includes('active')) pushLog(`🟢 ${a.id} 上線 [${a.model}]`, 'info');
            else if (prev && prev.status !== a.status) pushLog(`${a.status?.includes('active') ? '🟢' : '⚪'} ${a.id}: ${prev.status} → ${a.status}`, 'info');
            else if (prev && prev.model !== a.model) pushLog(`🔄 ${a.id}: 模型 ${prev.model || 'N/A'} → ${a.model || 'N/A'}`, 'info');
            previousAgentsMap[a.id] = a;
        });

        detectErrors(data);

        if (data.sys) {
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            const setB = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = Math.min(100, v) + '%'; };
            set('cpuVal', (data.sys.cpu || 0) + '%'); set('memVal', (data.sys.memory || 0) + '%'); set('diskVal', (data.sys.disk || 0) + '%');
            setB('cpuBar', data.sys.cpu); setB('memBar', data.sys.memory); setB('diskBar', data.sys.disk);
            const md = document.getElementById('memDetail');
            if (md && data.sys.memoryUsedGB) md.textContent = `${data.sys.memoryUsedGB} / ${data.sys.memoryTotalGB} GB`;
        }

        agents.sort((a, b) => {
            const prio = { active_executing: 0, active_recent: 1, dormant: 2, inactive: 3 };
            return (prio[a.status] ?? 4) - (prio[b.status] ?? 4) || a.id.localeCompare(b.id);
        });

        const q = agentSearchQuery.toLowerCase();
        const filteredAgents = q ? agents.filter(a =>
            (a.id || '').toLowerCase().includes(q) ||
            (a.model || '').toLowerCase().includes(q) ||
            (a.status || '').toLowerCase().includes(q)
        ) : agents;

        const gridEl = document.getElementById('agentGrid');
        const activeAgents2 = filteredAgents.filter(a => a.status === 'active_executing' || a.status === 'active_recent');
        const inactiveAgents = filteredAgents.filter(a => a.status !== 'active_executing' && a.status !== 'active_recent');

        function buildAgentCost(a) {
            return parseFloat(range === 'all' ? (a.costs?.total ?? a.cost ?? 0) : (a.costs?.[range] ?? a.cost ?? 0));
        }

        // Clear skeletons if present
        if (window.LoadingManager) LoadingManager.clearSkeletons('agentGrid');

        const frag = document.createDocumentFragment();
        if (filteredAgents.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            const iconWrap = document.createElement('div');
            iconWrap.className = 'empty-state-icon';
            const iconInner = document.createElement('span');
            iconInner.className = 'empty-icon-inner';
            iconInner.textContent = '��';
            iconWrap.appendChild(iconInner);
            empty.appendChild(iconWrap);
            const emptyTitle = document.createElement('div');
            emptyTitle.className = 'empty-state-title';
            emptyTitle.textContent = q ? '找不到符合的 Agent' : '沒有 Agent';
            empty.appendChild(emptyTitle);
            const emptyDesc = document.createElement('div');
            emptyDesc.className = 'empty-state-desc';
            emptyDesc.textContent = q ? '請嘗試其他關鍵字' : '目前沒有已註冊的 Agent';
            empty.appendChild(emptyDesc);
            frag.appendChild(empty);
        } else {
            if (activeAgents2.length > 0) {
                const grpHdr = document.createElement('div');
                grpHdr.className = 'agent-group-header';
                const dot2 = document.createElement('span');
                dot2.className = 'agent-group-dot online';
                const lbl = document.createElement('span');
                lbl.textContent = `執行中 (${activeAgents2.length})`;
                grpHdr.append(dot2, lbl);
                frag.appendChild(grpHdr);
                const activeGrid = document.createElement('div');
                activeGrid.className = 'agent-grid-inner';
                activeAgents2.forEach(a => {
                    const cost = buildAgentCost(a);
                    totalCost += cost;
                    activeCount++;
                    activeGrid.appendChild(buildAgentCardEl(a, cost));
                });
                frag.appendChild(activeGrid);
            }

            if (inactiveAgents.length > 0) {
                const details = document.createElement('details');
                details.open = true;
                details.className = 'agent-group-details';
                const summary = document.createElement('summary');
                summary.className = 'agent-group-header agent-group-summary';
                const dot2 = document.createElement('span');
                dot2.className = 'agent-group-dot idle';
                const lbl = document.createElement('span');
                lbl.textContent = `閒置 (${inactiveAgents.length})`;
                summary.append(dot2, lbl);
                details.appendChild(summary);
                const inactiveGrid = document.createElement('div');
                inactiveGrid.className = 'agent-grid-inner';
                inactiveAgents.forEach(a => {
                    const cost = buildAgentCost(a);
                    totalCost += cost;
                    inactiveGrid.appendChild(buildAgentCardEl(a, cost));
                });
                details.appendChild(inactiveGrid);
                frag.appendChild(details);
            }
        }
        gridEl.replaceChildren(frag);

        const subagents = (data.subagents || []).sort((a, b) => ({ running: 0, recent: 1, idle: 2 }[a.status] ?? 3) - ({ running: 0, recent: 1, idle: 2 }[b.status] ?? 3));
        document.getElementById('subagentGrid').innerHTML = subagents.slice(0, 40).map(s => {
            const sc = s.status === 'running' ? 'running' : (s.status === 'recent' ? 'active' : '');
            const sd = s.status === 'running' ? 'online' : (s.status === 'recent' ? 'running' : 'idle');
            const abt = s.abortedLastRun ? '<span style="color:var(--red);font-weight:600;font-size:10px"> ⚠️ ABORTED</span>' : '';
            const durationHtml = s.duration ? `<span class="agent-info-value" style="background:var(--bg-muted);padding:1px 4px;border-radius:4px">${s.duration}</span>` : '';

            return `<div class="agent-card ${sc}" style="padding:12px">
            <div class="agent-card-header" style="margin-bottom:8px">
                <div class="agent-card-name">
                    <div class="agent-avatar" style="width:28px;height:28px;font-size:12px;background:var(--accent-gradient)">🔗</div>
                    <div>
                        <div class="agent-name" style="font-size:12px">${esc(s.subagentId.slice(0, 8))}${abt}</div>
                        <div class="agent-hostname">by ${esc(s.ownerAgent)}</div>
                    </div>
                </div>
                <div class="agent-status ${sd}" style="font-size:10px;padding:2px 8px"><span class="agent-status-dot"></span>${esc(s.status.toUpperCase())}</div>
            </div>
            <div class="agent-task-preview" style="margin: 4px 0 8px 0; background: rgba(0,0,0,0.03); border-radius: 4px; padding: 6px;">
                <div class="agent-task-content" style="font-size:11px; color:var(--text); white-space: pre-wrap; word-break: break-word; max-height: 40px; overflow-y: auto;">${esc(s.label)}</div>
            </div>
            <div class="agent-info-row" style="font-size:11px; margin-bottom:2px">
                <span class="agent-info-label">最後活動</span>
                <span class="agent-info-value">${esc(s.lastActivity)}</span>
            </div>
            <div class="agent-info-row" style="font-size:11px">
                <span class="agent-info-label">模型 / 耗時</span>
                <div style="display:flex; gap:4px; align-items:center">
                    <span class="agent-info-value" style="font-size:10px; opacity:0.8">${s.model ? esc(s.model.split('/').pop()) : 'unknown'}</span>
                    ${durationHtml}
                </div>
            </div>
        </div>`;
        }).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center;">沒有 Sub-Agents</div>';

        document.getElementById('totalAgents').textContent = agents.length;
        document.getElementById('activeAgents').textContent = activeCount;
        document.getElementById('totalSubagents').textContent = subagents.length;
        document.getElementById('deviceOnlineStatus').textContent = `${activeCount}/${agents.length} 執行中`;
        document.getElementById('agentCountBadge').textContent = agents.length;
        document.getElementById('subagentCountBadge').textContent = subagents.length;
        updateCostDisplay();
        renderModelUsage('modelUsageList', 'costSummary', agents);
        if (currentSubTab === 'cron') fetchCronJobs();
    }

    window.renderModelUsage = renderModelUsage;
    window.buildAgentCardEl = buildAgentCardEl;
    window.renderDashboard = renderDashboard;
})();
