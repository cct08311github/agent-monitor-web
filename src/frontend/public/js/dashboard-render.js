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
            // innerHTML used here with esc() sanitized values only - no user input
            listEl.innerHTML = sorted
                .map(([model, u]) => {
                    const pct = Math.round((u.cost / maxCost) * 100);
                    return '<div class="model-usage-item"><div><span class="model-usage-name">' + esc(model) + '</span><span class="model-usage-sessions">(' + u.sessions + ')</span></div><div class="model-usage-bar" style="height:3px;border-radius:2px;background:var(--border);margin:3px 0"><div style="width:' + pct + '%;height:100%;border-radius:2px;background:var(--blue)"></div></div><div class="model-usage-stats"><div class="model-usage-tokens">' + formatTokens(u.total) + '</div><div class="model-usage-cost">' + formatTWD(u.cost) + '</div></div></div>';
                }).join('')
                || '<div style="color:var(--text-muted);padding:8px;font-size:12px;">尚無資料</div>';
        }
        const summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            summaryEl.textContent = '';
            var lbl = document.createElement('span');
            lbl.className = 'cost-summary-label';
            lbl.textContent = '總計';
            var val = document.createElement('span');
            val.className = 'cost-summary-value';
            val.textContent = formatTWD(totalCost);
            summaryEl.append(lbl, val);
        }
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

    // Build a compact subagent card using safe DOM methods
    function buildSubagentCardEl(s) {
        var sc = s.status === 'running' ? 'running' : (s.status === 'recent' ? 'active' : '');
        var sd = s.status === 'running' ? 'online' : (s.status === 'recent' ? 'running' : 'idle');

        var card = document.createElement('div');
        card.className = 'agent-card ' + sc;
        card.style.padding = '12px';

        // Header
        var hdr = document.createElement('div');
        hdr.className = 'agent-card-header';
        hdr.style.marginBottom = '8px';
        var nameWrap = document.createElement('div');
        nameWrap.className = 'agent-card-name';
        var av = document.createElement('div');
        av.className = 'agent-avatar';
        Object.assign(av.style, { width: '28px', height: '28px', fontSize: '12px' });
        av.textContent = '🔗';
        var nameInfo = document.createElement('div');
        var nameEl = document.createElement('div');
        nameEl.className = 'agent-name';
        nameEl.style.fontSize = '12px';
        nameEl.textContent = s.subagentId.slice(0, 8);
        if (s.abortedLastRun) {
            var abt = document.createElement('span');
            abt.style.cssText = 'color:var(--red);font-weight:600;font-size:10px';
            abt.textContent = ' ⚠️ ABORTED';
            nameEl.appendChild(abt);
        }
        var hostEl = document.createElement('div');
        hostEl.className = 'agent-hostname';
        hostEl.textContent = 'by ' + s.ownerAgent;
        nameInfo.append(nameEl, hostEl);
        nameWrap.append(av, nameInfo);
        var statusEl = document.createElement('div');
        statusEl.className = 'agent-status ' + sd;
        statusEl.style.cssText = 'font-size:10px;padding:2px 8px';
        var statusDot = document.createElement('span');
        statusDot.className = 'agent-status-dot';
        statusEl.append(statusDot, document.createTextNode(s.status.toUpperCase()));
        hdr.append(nameWrap, statusEl);

        // Task preview
        var preview = document.createElement('div');
        preview.className = 'agent-task-preview';
        preview.style.cssText = 'margin:4px 0 8px 0;background:rgba(0,0,0,0.03);border-radius:4px;padding:6px';
        var taskContent = document.createElement('div');
        taskContent.className = 'agent-task-content';
        taskContent.style.cssText = 'font-size:11px;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:40px;overflow-y:auto';
        taskContent.textContent = s.label;
        preview.appendChild(taskContent);

        // Info rows
        function subInfoRow(label, value) {
            var row = document.createElement('div');
            row.className = 'agent-info-row';
            row.style.fontSize = '11px';
            var l = document.createElement('span');
            l.className = 'agent-info-label';
            l.textContent = label;
            var v = document.createElement('span');
            v.className = 'agent-info-value';
            v.textContent = value;
            row.append(l, v);
            return row;
        }

        var row1 = subInfoRow('最後活動', s.lastActivity);
        row1.style.marginBottom = '2px';

        var row2 = document.createElement('div');
        row2.className = 'agent-info-row';
        row2.style.fontSize = '11px';
        var r2l = document.createElement('span');
        r2l.className = 'agent-info-label';
        r2l.textContent = '模型 / 耗時';
        var r2v = document.createElement('div');
        r2v.style.cssText = 'display:flex;gap:4px;align-items:center';
        var modelSpan = document.createElement('span');
        modelSpan.className = 'agent-info-value';
        modelSpan.style.cssText = 'font-size:10px;opacity:0.8';
        modelSpan.textContent = s.model ? s.model.split('/').pop() : 'unknown';
        r2v.appendChild(modelSpan);
        if (s.duration) {
            var durSpan = document.createElement('span');
            durSpan.className = 'agent-info-value';
            durSpan.style.cssText = 'background:var(--bg-muted);padding:1px 4px;border-radius:4px';
            durSpan.textContent = s.duration;
            r2v.appendChild(durSpan);
        }
        row2.append(r2l, r2v);

        card.append(hdr, preview, row1, row2);
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
            if (!prev && a.status?.includes('active')) pushLog('🟢 ' + a.id + ' 上線 [' + a.model + ']', 'info');
            else if (prev && prev.status !== a.status) pushLog((a.status?.includes('active') ? '🟢' : '⚪') + ' ' + a.id + ': ' + prev.status + ' → ' + a.status, 'info');
            else if (prev && prev.model !== a.model) pushLog('🔄 ' + a.id + ': 模型 ' + (prev.model || 'N/A') + ' → ' + (a.model || 'N/A'), 'info');
            previousAgentsMap[a.id] = a;
        });

        detectErrors(data);

        if (data.sys) {
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            const setB = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = Math.min(100, v) + '%'; };
            set('cpuVal', (data.sys.cpu || 0) + '%'); set('memVal', (data.sys.memory || 0) + '%'); set('diskVal', (data.sys.disk || 0) + '%');
            setB('cpuBar', data.sys.cpu); setB('memBar', data.sys.memory); setB('diskBar', data.sys.disk);
            const md = document.getElementById('memDetail');
            if (md && data.sys.memoryUsedGB) md.textContent = data.sys.memoryUsedGB + ' / ' + data.sys.memoryTotalGB + ' GB';
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

        if (window.LoadingManager) LoadingManager.clearSkeletons('agentGrid');

        // ── Minimap: one dot per agent for instant health overview ──
        var minimapEl = document.getElementById('agentMinimap');
        if (minimapEl) {
            var mFrag = document.createDocumentFragment();
            agents.forEach(function (a) {
                var d = document.createElement('div');
                var si2 = getStatusInfo(a.status);
                d.className = 'minimap-dot ' + si2.class;
                d.title = a.id + ' — ' + si2.text;
                d.addEventListener('click', function () { showAgentDetail(a.id); });
                mFrag.appendChild(d);
            });
            minimapEl.replaceChildren(mFrag);
        }

        // ── Focus area: active agents as large cards ──
        var focusEl = document.getElementById('agentFocus');
        if (focusEl) {
            var fFrag = document.createDocumentFragment();
            if (activeAgents2.length > 0) {
                var focusLabel = document.createElement('div');
                focusLabel.className = 'focus-label';
                focusLabel.textContent = '執行中 (' + activeAgents2.length + ')';
                fFrag.appendChild(focusLabel);
                var focusGrid = document.createElement('div');
                focusGrid.className = 'focus-grid';
                activeAgents2.forEach(function (a) {
                    var cost = buildAgentCost(a);
                    totalCost += cost;
                    activeCount++;
                    var card = buildAgentCardEl(a, cost);
                    card.classList.add('focus-card');
                    focusGrid.appendChild(card);
                });
                fFrag.appendChild(focusGrid);
            }
            focusEl.replaceChildren(fFrag);
        }

        // ── Periphery: idle agents as compact rows ──
        var periphEl = document.getElementById('agentPeriphery');
        if (periphEl) {
            var pFrag = document.createDocumentFragment();
            if (inactiveAgents.length > 0) {
                var pDetails = document.createElement('details');
                pDetails.open = true;
                pDetails.className = 'periphery-details';
                var pSummary = document.createElement('summary');
                pSummary.className = 'periphery-header';
                pSummary.textContent = '閒置 (' + inactiveAgents.length + ')';
                pDetails.appendChild(pSummary);

                var thead = document.createElement('div');
                thead.className = 'periphery-row periphery-thead';
                ['', 'AGENT', 'MODEL', 'ACTIVITY', 'COST', 'TOKENS'].forEach(function (t, i) {
                    var sp = document.createElement('span');
                    sp.className = ['periphery-dot-col', 'periphery-name', 'periphery-model', 'periphery-activity', 'periphery-cost', 'periphery-tokens'][i];
                    sp.textContent = t;
                    thead.appendChild(sp);
                });
                pDetails.appendChild(thead);

                inactiveAgents.forEach(function (a) {
                    var cost = buildAgentCost(a);
                    totalCost += cost;
                    var row = document.createElement('div');
                    row.className = 'periphery-row';
                    row.addEventListener('click', function () { showAgentDetail(a.id); });

                    var si3 = getStatusInfo(a.status);
                    var dotEl = document.createElement('span');
                    dotEl.className = 'periphery-dot ' + si3.class;
                    var nameEl2 = document.createElement('span');
                    nameEl2.className = 'periphery-name';
                    nameEl2.textContent = a.id;
                    var modelEl = document.createElement('span');
                    modelEl.className = 'periphery-model';
                    modelEl.textContent = (a.model || '').split('/').pop() || 'N/A';
                    var actEl = document.createElement('span');
                    actEl.className = 'periphery-activity';
                    actEl.textContent = a.lastActivity || '—';
                    var costEl = document.createElement('span');
                    costEl.className = 'periphery-cost';
                    costEl.textContent = formatTWD(cost);
                    var tokEl = document.createElement('span');
                    tokEl.className = 'periphery-tokens';
                    tokEl.textContent = formatTokens(a.tokens?.total);

                    row.append(dotEl, nameEl2, modelEl, actEl, costEl, tokEl);
                    pDetails.appendChild(row);
                });
                pFrag.appendChild(pDetails);
            }
            periphEl.replaceChildren(pFrag);
        }

        // Empty state
        if (filteredAgents.length === 0 && focusEl) {
            var empty = document.createElement('div');
            empty.className = 'empty-state';
            var eIcon = document.createElement('div');
            eIcon.className = 'empty-state-icon';
            eIcon.textContent = '🔍';
            var eTitle = document.createElement('div');
            eTitle.className = 'empty-state-title';
            eTitle.textContent = q ? '找不到符合的 Agent' : '沒有 Agent';
            var eDesc = document.createElement('div');
            eDesc.className = 'empty-state-desc';
            eDesc.textContent = q ? '請嘗試其他關鍵字' : '目前沒有已註冊的 Agent';
            empty.append(eIcon, eTitle, eDesc);
            focusEl.replaceChildren(empty);
        }

        if (gridEl) gridEl.replaceChildren();

        // Subagents - use safe DOM methods
        var subagentGridEl = document.getElementById('subagentGrid');
        const subagents = (data.subagents || []).sort((a, b) => ({ running: 0, recent: 1, idle: 2 }[a.status] ?? 3) - ({ running: 0, recent: 1, idle: 2 }[b.status] ?? 3));
        var subFrag = document.createDocumentFragment();
        if (subagents.length === 0) {
            var noSub = document.createElement('div');
            noSub.style.cssText = 'color:var(--text-muted);padding:20px;text-align:center';
            noSub.textContent = '沒有 Sub-Agents';
            subFrag.appendChild(noSub);
        } else {
            subagents.slice(0, 40).forEach(function (s) {
                subFrag.appendChild(buildSubagentCardEl(s));
            });
        }
        subagentGridEl.replaceChildren(subFrag);

        document.getElementById('totalAgents').textContent = agents.length;
        document.getElementById('activeAgents').textContent = activeCount;
        document.getElementById('totalSubagents').textContent = subagents.length;
        document.getElementById('deviceOnlineStatus').textContent = activeCount + '/' + agents.length + ' 執行中';
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
