/* ================================================
   OpenClaw Watch Pro v2.0.2
   Fixes:
   1) forbidden_host debug info + better error display
   2) Dismiss errors properly (suppress until changed)
   3) Error timestamps
   4) SRE response panel with follow-up conversation
   ================================================ */

currentExchangeRate = 32.0; // Fallback default
latestDashboard = null;
previousAgentsMap = {};
currentDesktopTab = 'monitor';
currentSubTab = 'agents';
isMobile = window.matchMedia('(max-width: 768px)').matches;
agentSearchQuery = '';
_currentDetailAgentId = '';
function onAgentSearch(val) { agentSearchQuery = (val || '').trim(); if (latestDashboard) renderDashboard(latestDashboard); }
lastErrors = [];
// Persist dismissed/shown errors in localStorage so they survive page refresh
function loadErrorKeys(key) {
    try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        return new Map(Object.entries(stored));
    } catch { return new Map(); }
}
function saveErrorKeys(key, map) {
    try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(map))); } catch { }
}
dismissedErrorMap = loadErrorKeys('oc_dismissed_errors');
shownErrorMap = loadErrorKeys('oc_shown_errors');
commandRunning = false;
lastSseTs = 0;
_connTimerHandle = null;
chatSending = false;


window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
    isMobile = e.matches;
});

// --- Utilities ---
function esc(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTokens(n) {
    n = Number(n || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
    return n.toString();
}

function formatTWD(usd) {
    const twd = usd * currentExchangeRate;
    if (twd >= 1000) return 'NT$' + twd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (twd >= 100) return 'NT$' + twd.toFixed(0);
    if (twd >= 1) return 'NT$' + twd.toFixed(1);
    return 'NT$' + twd.toFixed(2);
}

function fmtTime(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function getAgentEmoji(id) {
    const map = {
        main: '🏠', coder: '💻', code: '💻', sre: '🛡️', finance: '💰',
        writer: '✍️', research: '🔬', creative: '🎨', tester: '🧪',
        intelligence: '🧠', architect: '🏗️', pm: '📋', docs: '📚',
        github: '🐙', critic: '🔍', data: '📊', life: '🍳', gourmet: '🍳',
        visionary: '🔮', dev: '⚙️', work: '💼', concierge: '🛎️',
    };
    for (const [key, emoji] of Object.entries(map)) {
        if (id.includes(key)) return emoji;
    }
    return '🤖';
}

function getStatusInfo(status) {
    switch (status) {
        case 'active_executing': return { class: 'running', text: '執行中', dotClass: 'online' };
        case 'active_recent': return { class: 'active', text: '活動中', dotClass: 'online' };
        case 'dormant': return { class: 'dormant', text: '休眠中', dotClass: 'idle' };
        default: return { class: '', text: '離線', dotClass: 'offline' };
    }
}

// --- Log Terminal ---
function pushLog(msg, level = 'info') {
    const term = document.getElementById('logTerminal');
    if (!term) return;
    const ts = fmtTime();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-ts">${ts.slice(11)}</span><span class="log-level ${level}">${level.toUpperCase()}</span><span class="log-msg">${esc(msg)}</span>`;
    term.appendChild(entry);
    if (term.childElementCount > 200) term.removeChild(term.firstElementChild);
    term.scrollTop = term.scrollHeight;
}

// --- Alert Badge ---
let unreadAlertCount = 0;
let _alertConfigCache = null;
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

// --- Alert Config Modal ---
async function openAlertConfig() {
    clearAlertBadge();
    try {
        const { config } = await window.apiClient.get('/api/alerts/config');
        _alertConfigCache = config;
        const modal = document.getElementById('alertConfigModal');
        const tbody = document.getElementById('alertConfigBody');

        // Build table rows using safe DOM manipulation (no innerHTML with untrusted data)
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
                threshold: (() => { const v = document.getElementById(`thr_${rule}`)?.value; return (v !== undefined && v !== '') ? parseFloat(v) : _alertConfigCache.rules[rule].threshold; })(),
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
        // Use sub-agent IDs as fingerprint — same IDs = same old event, don't re-show
        const fingerprint = 'aborted:' + aborted.map(s => s.subagentId).sort().join(',');
        newErrors.push({ msg: `${aborted.length} 個 Sub-Agent 上次執行時被中斷`, key: fingerprint });
    }

    // Only show errors whose fingerprint hasn't been shown/dismissed before
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

// --- Render ---
function renderModelUsage(listId, summaryId, agents) {
    const range = document.getElementById('costRange')?.value || 'month';
    const allModelUsage = {};
    let totalCost = 0;

    agents.forEach(a => {
        // Calculate total for the summary
        const agentPeriodCost = (range === 'all' ? (a.costs?.total ?? a.cost ?? 0) : (a.costs?.[range] ?? a.cost ?? 0));
        totalCost += parseFloat(agentPeriodCost);

        if (a.modelUsage) {
            Object.entries(a.modelUsage).forEach(([model, u]) => {
                if (!allModelUsage[model]) allModelUsage[model] = { total: 0, cost: 0, sessions: 0 };
                allModelUsage[model].total += u.total;
                // Note: modelUsage breakdown remains aggregate in this version 
                // but we could extend backend to provide periodic modelUsage if needed
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

function _buildAgentCardEl(a, cost) {
    const si = getStatusInfo(a.status);
    const card = document.createElement('div');
    card.className = 'agent-card ' + si.class;
    card.addEventListener('click', () => showAgentDetail(a.id));

    // Header: avatar + name/model + status
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
    const dot = document.createElement('span');
    dot.className = 'agent-status-dot';
    statusEl.append(dot, document.createTextNode(si.text));
    hdr.append(nameWrap, statusEl);

    // Body: cost, tokens, activity
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
        infoRow('費用',   formatTWD(cost)),
        infoRow('Tokens', formatTokens(a.tokens?.total)),
        infoRow('活動',   a.lastActivity || '-'),
    );

    // Task preview
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

    // Actions
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
    if (data.exchangeRate) {
        currentExchangeRate = data.exchangeRate;
    }
    // OpenClaw version
    const verEl = document.getElementById('openclawVersion');
    if (verEl) verEl.textContent = data.openclaw?.version || 'unknown';
    const range = document.getElementById('costRange')?.value || 'month';
    const agents = data.agents || [];
    let totalCost = 0, activeCount = 0;

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

    const frag = document.createDocumentFragment();

    if (filteredAgents.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:var(--text-muted);padding:20px;text-align:center;';
        empty.textContent = q ? '找不到符合的 Agent' : '沒有 Agent';
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
                activeGrid.appendChild(_buildAgentCardEl(a, cost));
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
                inactiveGrid.appendChild(_buildAgentCardEl(a, cost));
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
    if (currentSubTab === 'cron') fetchCronJobs(); // Refresh cron if looking at it
}

// --- Data ---
async function update(force = false) {
    try {
        const data = await window.apiClient.get(force ? `/api/read/dashboard?force=1&t=${Date.now()}` : '/api/read/dashboard');
        renderDashboard(data);
    } catch (e) {
        pushLog('連線中斷...', 'err');
    }
}
