/* ================================================
   OpenClaw Watch Pro v2.0.2
   Fixes:
   1) forbidden_host debug info + better error display
   2) Dismiss errors properly (suppress until changed)
   3) Error timestamps
   4) SRE response panel with follow-up conversation
   ================================================ */

let currentExchangeRate = 32.0; // Fallback default

// --- State ---
let latestDashboard = null;
let previousAgentsMap = {};
let currentDesktopTab = 'monitor';
let currentSubTab = 'agents';
let isMobile = window.matchMedia('(max-width: 768px)').matches;
let agentSearchQuery = '';
function onAgentSearch(val) { agentSearchQuery = (val || '').trim(); if (latestDashboard) renderDashboard(latestDashboard); }
let lastErrors = [];
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
let dismissedErrorMap = loadErrorKeys('oc_dismissed_errors');
let shownErrorMap = loadErrorKeys('oc_shown_errors');
let commandRunning = false;
let lastSseTs = 0;
let _connTimerHandle = null;
let chatSending = false;


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

// --- Navigation ---
function switchDesktopTab(tab) {
    currentDesktopTab = tab;
    // Generic dtab pages (not chat tab)
    document.querySelectorAll('.dtab-page:not(.chat-tab-page)').forEach(p => p.classList.remove('active'));
    // Chat tab uses its own class
    const chatPage = document.getElementById('dtabChat');
    if (chatPage) chatPage.classList.toggle('active-tab', tab === 'chat');

    const pageId = { monitor: 'dtabMonitor', system: 'dtabSystem', logs: 'dtabLogs', detail: 'dtabDetail' }[tab];
    if (pageId) document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.desktop-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === tab));
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
        setSlot(1, '總 Agents',  '🤖', 'blue');
        setSlot(2, '執行中',     '🟢', 'green');
        setSlot(3, 'Sub-Agents', '🔗', 'orange');
        setSlot(4, '本月費用',   '💰', 'purple');
    } else if (tab === 'system') {
        setSlot(1, 'CPU',    '💻', 'blue');
        setSlot(2, '記憶體', '🧠', 'green');
        setSlot(3, '磁碟',   '💾', 'orange');
        setSlot(4, '本月費用', '💰', 'purple');
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('totalAgents',    (sys.cpu    || 0) + '%');
        set('activeAgents',   (sys.memory || 0) + '%');
        set('totalSubagents', (sys.disk   || 0) + '%');
    } else if (tab === 'logs') {
        setSlot(1, 'OC 版本',  '📦', 'blue');
        setSlot(2, 'Watchdog', '🐕', 'green');
        setSlot(3, '本月費用', '💰', 'orange');
        setSlot(4, 'Sub-Agents', '🔗', 'purple');
        const ver = document.getElementById('openclawVersion')?.textContent || '-';
        const wd  = document.getElementById('watchdogStateText')?.textContent || '-';
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('totalAgents',  ver);
        set('activeAgents', wd);
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

// --- Error Handling (#2: suppress dismissed, #3: add timestamps) ---
function showErrorBanner(msg) {
    // Don't show if this error was dismissed
    if (dismissedErrorMap.has(msg)) return;

    const banner = document.getElementById('errorBanner');
    const ts = fmtTime();
    document.getElementById('errorBannerMsg').textContent = `[${ts}] ${msg}`;
    document.getElementById('errorBannerMsg').dataset.rawMsg = msg; // store raw message for SRE
    banner.style.display = 'block';

    // Update error list
    if (!lastErrors.find(e => e.msg === msg)) {
        lastErrors.push({ msg, ts });
    }
}

function dismissError() {
    const banner = document.getElementById('errorBanner');
    const rawMsg = document.getElementById('errorBannerMsg').dataset.rawMsg;
    const now = Date.now();
    // Mark this error as dismissed so it won't re-appear (persisted)
    if (rawMsg) dismissedErrorMap.set(rawMsg, now);
    // Also dismiss all current errors
    lastErrors.forEach(e => dismissedErrorMap.set(e.msg, now));
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

// (#4) Send error to SRE with response panel
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
        lastErrors.length > 1 ? `其他錯誤:\n${lastErrors.map(e => `- [${e.ts}] ${e.msg}`).join('\n')}` : '',
        `請診斷問題並提供修復建議。`
    ].filter(Boolean).join('\n');

    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'talk', agentId: 'sre', message: fullReport })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.output || 'Failed');
        showToast('✅ 已通知 SRE，opening response...', 'success');
        pushLog('✅ SRE 已收到錯誤報告', 'info');

        // Show SRE response in dedicated panel
        showSREResponse(data.output || '(SRE 正在分析中...)');
    } catch (e) {
        showToast(`❌ 發送失敗: ${e.message}`, 'error');
        pushLog(`❌ SRE 通知失敗: ${e.message}`, 'err');
        // Show error in SRE panel too, with debug info
        showSREResponse(`❌ 通知失敗: ${e.message}\n\n如果是 forbidden_host，請確認伺服器已重新啟動。`);
    }
}

// SRE Response Panel
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
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'talk', agentId: 'sre', message: msg })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.output || 'Failed');
        log.innerHTML += `<div class="sre-response-entry"><div class="sre-label">🛡️ SRE — ${fmtTime()}</div><div class="sre-content">${esc(data.output)}</div></div>`;
    } catch (e) {
        log.innerHTML += `<div class="sre-response-entry error"><div class="sre-content">❌ ${esc(e.message)}</div></div>`;
    }
    chatSending = false;
    log.scrollTop = log.scrollHeight;
}

function closeSREModal() { document.getElementById('sreModal').style.display = 'none'; }

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
        const res = await fetch('/api/alerts/config');
        const { config } = await res.json();
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
        const saveRes = await fetch('/api/alerts/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if (!saveRes.ok) { showToast('儲存失敗', 'error'); return; }
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

// --- Commands (#1: show debug info on forbidden_host) ---
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
    document.querySelectorAll('.cmd-btn').forEach(b => b.disabled = true);

    try {
        let url, opts;
        if (['status', 'models', 'agents'].includes(cmd)) {
            url = `/api/read/${cmd}`;
            opts = { method: 'GET' };
        } else {
            url = '/api/command';
            opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) };
        }
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok || !data.success) {
            // Show debug info if forbidden_host
            let errMsg = data.error || data.message || 'Failed';
            if (data._debug_host) errMsg += `\nHost: ${data._debug_host}`;
            if (data._debug_origin) errMsg += `\nOrigin: ${data._debug_origin}`;
            throw new Error(errMsg);
        }
        pushLog(`✅ [${cmd.toUpperCase()}] 完成`, 'info');
        if (['status', 'models', 'agents'].includes(cmd)) {
            showCmdOutput(`📋 ${cmd.toUpperCase()}`, data.output || JSON.stringify(data, null, 2));
        } else {
            showToast(`✅ ${cmd} 完成`, 'success');
        }
    } catch (e) {
        pushLog(`❌ ${cmd} 失敗: ${e.message}`, 'err');
        showToast(`❌ ${e.message}`, 'error');
    } finally {
        commandRunning = false;
        document.querySelectorAll('.cmd-btn').forEach(b => b.disabled = false);
    }
}

function showCmdOutput(title, content) {
    document.getElementById('cmdOutputTitle').textContent = title;
    document.getElementById('cmdOutputContent').textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    document.getElementById('cmdOutputModal').style.display = 'flex';
}
function closeCmdOutput() { document.getElementById('cmdOutputModal').style.display = 'none'; }

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

function showAgentDetail(agentId) {
    const data = latestDashboard;
    if (!data) return;
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
    _loadSessionList(agentId);
}

function _loadSessionList(agentId) {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/sessions`)
        .then(r => r.json())
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

function renderAgentActivityBanner(agentActivity) {
    const el = document.getElementById('agentActivityBanner');
    if (!el || !agentActivity?.length) return;
    const total = agentActivity.length;
    const active = agentActivity.filter(a => a.active_minutes > 0).length;
    const lastSeen = agentActivity.reduce((max, a) => (a.last_seen > max ? a.last_seen : max), '');
    el.textContent = `過去 24h：${total} 個 Agent，${active} 個曾活躍｜最後活動：${lastSeen ? lastSeen.slice(11, 16) : '-'}`;
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
        const res = await fetch(force ? `/api/read/dashboard?force=1&t=${Date.now()}` : '/api/read/dashboard');
        renderDashboard(await res.json());
    } catch (e) {
        pushLog('連線中斷...', 'err');
    }
}

function initRealtime() {
    pushLog('連接即時串流...', 'info');
    const es = new EventSource('/api/read/stream');

    es.onmessage = (e) => {
        try {
            renderDashboard(JSON.parse(e.data));
            lastSseTs = Date.now();
            _setConnDot('online');
        } catch (x) { }
    };

    es.addEventListener('alert', (e) => {
        try {
            const { alerts } = JSON.parse(e.data);
            alerts.forEach(a => {
                const type = a.severity === 'critical' ? 'error' : (a.severity === 'warning' ? 'warning' : 'info');
                showToast(`🚨 ${a.message}`, type);
                pushLog(`[ALERT] ${a.message}`, a.severity === 'critical' ? 'err' : 'warn');
            });
            incrementAlertBadge(alerts.length);
        } catch (x) { }
    });

    es.onerror = () => {
        pushLog('串流中斷，5s 後重連...', 'err');
        es.close();
        _setConnDot('offline');
        setTimeout(initRealtime, 5000);
    };
}

function _setConnDot(state) {
    const dot = document.getElementById('connDot');
    if (!dot) return;
    dot.className = 'conn-dot conn-dot-' + state;
}

function startConnectionTimer() {
    if (_connTimerHandle) clearInterval(_connTimerHandle);
    _connTimerHandle = setInterval(() => {
        const dot = document.getElementById('connDot');
        if (!dot) return;
        if (lastSseTs === 0) { _setConnDot('unknown'); return; }
        const sec = Math.floor((Date.now() - lastSseTs) / 1000);
        dot.title = sec < 60 ? `最後更新：${sec}s 前` : `最後更新：${Math.floor(sec / 60)}m 前`;
        if (sec > 60) _setConnDot('offline');
    }, 1000);
}

// --- Watchdog ---
async function fetchWatchdogStatus() {
    try {
        const res = await fetch('/api/watchdog/status');
        const data = await res.json();
        if (data.success && data.watchdog) renderWatchdogStatus(data.watchdog);
    } catch (e) { /* silent */ }
}

function renderWatchdogStatus(wd) {
    const indicator = document.getElementById('watchdogIndicator');
    const stateText = document.getElementById('watchdogStateText');
    const toggle = document.getElementById('watchdogToggle');
    const stats = document.getElementById('watchdogStats');
    const history = document.getElementById('watchdogHistory');

    if (!indicator) return;

    const statusMap = {
        healthy: { text: '✅ 正常運作', css: 'healthy' },
        degraded: { text: '⚠️ 部分異常', css: 'degraded' },
        down: { text: '🔴 Gateway 異常', css: 'down' },
        repairing: { text: '🔧 修復中...', css: 'repairing' },
        escalated: { text: '🚨 需人工介入', css: 'escalated' },
        unknown: { text: '⏳ 檢查中...', css: '' },
    };
    const st = statusMap[wd.currentStatus] || statusMap.unknown;
    if (!wd.isRunning) { st.text = '⏸ 已暫停'; st.css = 'stopped'; }

    indicator.className = `watchdog-indicator ${st.css}`;
    stateText.textContent = st.text;
    toggle.checked = wd.isRunning;

    stats.innerHTML = `
        <div class="watchdog-stat"><span class="watchdog-stat-label">最後正常</span><span class="watchdog-stat-value">${wd.lastHealthy || '-'}</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">連續失敗</span><span class="watchdog-stat-value">${wd.consecutiveFailures}</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">已修復</span><span class="watchdog-stat-value">${wd.totalRepairs} 次</span></div>
        <div class="watchdog-stat"><span class="watchdog-stat-label">告警</span><span class="watchdog-stat-value">${wd.totalAlerts} 次</span></div>
    `;

    const recentEvents = (wd.events || []).slice(-8).reverse();
    history.innerHTML = recentEvents.length ? recentEvents.map(e => {
        const lvl = e.level === 'err' ? 'color:var(--red)' : (e.level === 'warn' ? 'color:var(--orange)' : '');
        return `<div class="watchdog-event"><span class="watchdog-event-ts">${(e.tsLocal || '').slice(11)}</span><span class="watchdog-event-msg" style="${lvl}">${esc(e.msg)}</span></div>`;
    }).join('') : '<div style="font-size:11px;color:var(--text-muted);padding:4px">暫無事件</div>';
}

async function toggleWatchdog(enabled) {
    showToast(enabled ? '🐕 啟動 Watchdog...' : '⏸ 暫停 Watchdog...', 'info');
    try {
        const res = await fetch('/api/watchdog/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            renderWatchdogStatus(data.watchdog);
            showToast(enabled ? '✅ Watchdog 已啟動' : '⏸ Watchdog 已暫停', 'success');
            pushLog(enabled ? '🐕 Watchdog 啟動' : '⏸ Watchdog 暫停', 'info');
        }
    } catch (e) {
        showToast(`❌ 操作失敗: ${e.message}`, 'error');
    }
}

async function manualRepair() {
    if (!confirm('⚠️ 確認手動觸發 Gateway 修復？')) return;
    showToast('🔧 正在手動修復 Gateway...', 'info');
    pushLog('🔧 手動觸發 Gateway 修復', 'warn');
    try {
        const res = await fetch('/api/watchdog/repair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.repaired ? '✅ Gateway 修復成功！' : '❌ 修復失敗，需人工介入', data.repaired ? 'success' : 'error');
            pushLog(data.repaired ? '✅ 手動修復成功' : '❌ 手動修復失敗', data.repaired ? 'info' : 'err');
        } else {
            throw new Error(data.error || 'Repair failed');
        }
    } catch (e) {
        showToast(`❌ 修復失敗: ${e.message}`, 'error');
        pushLog(`❌ 手動修復失敗: ${e.message}`, 'err');
    }
    fetchWatchdogStatus();
}

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            updateCharCount();
            autoGrowTextarea(chatInput);
        });
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                // Shift+Enter always sends (desktop shortcut)
                e.preventDefault();
                sendChat();
            } else if (e.key === 'Enter' && isMobile) {
                // On mobile, plain Enter also sends (like iMessage/WhatsApp)
                e.preventDefault();
                sendChat();
            }
            // Desktop plain Enter = newline (default textarea behavior)
        });
    }
    const sreInput = document.getElementById('sreInput');
    if (sreInput) sreInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendSREFollowUp(); });
    pushLog('OpenClaw Watch Pro v2.0.3 啟動（含 Watchdog）', 'info');
    update(true); // 立即載入一次資料，不等 SSE
    initRealtime();
    startConnectionTimer();
    fetchHistory();
    fetchWatchdogStatus();
    setInterval(fetchHistory, 60000);
    setInterval(fetchWatchdogStatus, 15000); // Poll watchdog every 15s
    window.addEventListener('resize', () => setTimeout(updateCharts, 200));
    // Redraw charts when theme changes
    document.addEventListener('themechange', () => {
        if (currentDesktopTab === 'system') updateCharts();
    });

    // Ensure theme manager is initialized and button is properly connected
    if (typeof ThemeManager !== 'undefined') {
        console.log('ThemeManager detected, ensuring button connection');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) {
            // Remove existing onclick to avoid conflicts
            themeBtn.removeAttribute('onclick');
            themeBtn.addEventListener('click', window.toggleTheme);
            console.log('Theme button reconnected programmatically');
        }
    }
});
