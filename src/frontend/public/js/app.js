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
let currentTargetAgent = null;
let modelSwitchTarget = null;
let currentDesktopTab = 'monitor';
let currentSubTab = 'agents';
let isMobile = window.matchMedia('(max-width: 768px)').matches;
let sysHistoryData = [];
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
let chatSending = false;
let cronJobs = [];
let isCronLoading = false;

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
    document.querySelectorAll('.dtab-page').forEach(p => p.classList.remove('active'));
    const pageId = { monitor: 'dtabMonitor', system: 'dtabSystem', logs: 'dtabLogs', detail: 'dtabDetail' }[tab];
    if (pageId) document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.desktop-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === tab));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === tab));
    if (tab === 'system') setTimeout(updateCharts, 100);
}

function switchSubTab(tab) {
    currentSubTab = tab;
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.dataset.subtab === tab));
    document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
    const contentId = { agents: 'subTabAgents', subagents: 'subTabSubagents', cron: 'subTabCron' }[tab];
    if (contentId) document.getElementById(contentId).classList.add('active');
    if (tab === 'cron') fetchCronJobs();
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
    document.getElementById('alertBadge').style.display = 'inline-flex';
    document.getElementById('alertCount').textContent = lastErrors.length;
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
    document.getElementById('alertBadge').style.display = 'none';
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
        if (lastErrors.length > 0) {
            document.getElementById('alertCount').textContent = lastErrors.length;
        }
    }
}

// --- Chat ---
function openChat(agentId) {
    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) { showToast('❌ 無效的 Agent ID', 'error'); return; }
    currentTargetAgent = agentId;
    document.getElementById('chatTitle').textContent = `💬 ${agentId.toUpperCase()}`;
    document.getElementById('chatLog').innerHTML = '';
    document.getElementById('chatInput').value = '';
    updateCharCount();
    document.getElementById('chatModal').style.display = 'flex';
    document.getElementById('chatInput').focus();

    // Auto-send "hi"
    const log = document.getElementById('chatLog');
    log.innerHTML += `<div class="chat-msg system">正在連接 ${agentId}...</div>`;
    autoSendHi(agentId);
}

async function autoSendHi(agentId) {
    const log = document.getElementById('chatLog');
    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'talk', agentId: agentId, message: 'hi' })
        });
        const data = await res.json();
        if (!data.success) {
            // Include debug info if available (#1 fix)
            let errDetail = data.error || 'Failed';
            if (data._debug_host) errDetail += ` (host: ${data._debug_host})`;
            if (data._debug_origin) errDetail += ` (origin: ${data._debug_origin})`;
            throw new Error(errDetail);
        }
        const sysMsg = log.querySelector('.chat-msg.system');
        if (sysMsg) sysMsg.remove();
        log.innerHTML += `<div class="chat-msg user">hi</div>`;
        log.innerHTML += `<div class="chat-msg agent">${esc(data.output)}</div>`;
    } catch (e) {
        const sysMsg = log.querySelector('.chat-msg.system');
        if (sysMsg) sysMsg.remove();
        log.innerHTML += `<div class="chat-msg error">❌ 連接失敗: ${esc(e.message)}</div>`;
        pushLog(`Chat error (${agentId}): ${e.message}`, 'err');
    }
    log.scrollTop = log.scrollHeight;
}

function closeChat() { document.getElementById('chatModal').style.display = 'none'; }

function updateCharCount() {
    const input = document.getElementById('chatInput');
    const counter = document.getElementById('chatCharCount');
    if (input && counter) counter.textContent = `${input.value.length}/2000`;
}

async function sendChat() {
    if (chatSending) return;
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.length > 2000) { showToast('❌ 訊息超過 2000 字', 'error'); return; }
    if (!currentTargetAgent || !/^[A-Za-z0-9_-]+$/.test(currentTargetAgent)) { showToast('❌ 無效的 Agent ID', 'error'); return; }

    chatSending = true;
    const log = document.getElementById('chatLog');
    log.innerHTML += `<div class="chat-msg user">${esc(msg)}</div>`;
    input.value = '';
    updateCharCount();
    log.scrollTop = log.scrollHeight;

    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'talk', agentId: currentTargetAgent, message: msg })
        });
        const data = await res.json();
        if (!data.success) {
            let errDetail = data.error || 'Failed';
            if (data._debug_host) errDetail += ` (host: ${data._debug_host})`;
            throw new Error(errDetail);
        }
        log.innerHTML += `<div class="chat-msg agent">${esc(data.output)}</div>`;
    } catch (e) {
        log.innerHTML += `<div class="chat-msg error">❌ ${esc(e.message)}</div>`;
        pushLog(`Chat error (${currentTargetAgent}): ${e.message}`, 'err');
    }
    chatSending = false;
    log.scrollTop = log.scrollHeight;
}

// --- Model Switch ---
function openModelModal(agentId, currentModel) {
    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) { showToast('❌ 無效的 Agent ID', 'error'); return; }
    modelSwitchTarget = agentId;
    document.getElementById('modelCurrentInfo').textContent = `Agent: ${agentId} | 目前模型: ${currentModel || '未知'}`;
    document.getElementById('modelModal').style.display = 'flex';
}
function closeModelModal() { document.getElementById('modelModal').style.display = 'none'; }

async function confirmModelSwitch() {
    const model = document.getElementById('modelSelect').value;
    if (!modelSwitchTarget || !model) return;
    if (!/^[A-Za-z0-9._/-]+$/.test(model)) { showToast('❌ 無效的模型名稱', 'error'); return; }
    closeModelModal();
    showToast(`正在切換 ${modelSwitchTarget} → ${model}...`, 'info');
    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'switch-model', agentId: modelSwitchTarget, model })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.output || 'Failed');
        showToast(`✅ ${modelSwitchTarget} 已切換至 ${model}`, 'success');
        pushLog(`Model switched: ${modelSwitchTarget} → ${model}`, 'info');
        await update(true);
        if (currentDesktopTab === 'detail' && modelSwitchTarget) {
            showAgentDetail(modelSwitchTarget);
        }
    } catch (e) {
        showToast(`❌ 切換失敗: ${e.message}`, 'error');
        pushLog(`Model switch failed: ${e.message}`, 'err');
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

// --- Charts ---
function drawSparkline(canvasId, data, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { top: 22, right: 10, bottom: 24, left: 35 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);
    // Detect dark mode from data-theme attribute or system preference
    const theme = document.documentElement.getAttribute('data-theme');
    const isDark = theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    const colors = [
        { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)', label: 'CPU' },
        { stroke: '#22c55e', fill: 'rgba(34,197,94,0.1)', label: 'MEM' },
    ];

    ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ch / 4) * i;
        ctx.fillText((100 - i * 25) + '%', pad.left - 4, y + 3);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }

    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data[0]?.length / 6) || 1);
    if (labels) {
        for (let i = 0; i < (data[0]?.length || 0); i += step) {
            const x = pad.left + (i / ((data[0]?.length || 1) - 1 || 1)) * cw;
            ctx.fillText(labels[i] || '', x, h - 4);
        }
    }

    ctx.textAlign = 'left';
    colors.forEach((c, idx) => {
        const lx = pad.left + idx * 60;
        ctx.fillStyle = c.stroke; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'; ctx.fillText(c.label, lx + 14, 12);
    });

    data.forEach((series, si) => {
        if (!series || series.length === 0) return;
        const color = colors[si] || colors[0];
        ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ch);
        series.forEach((val, i) => {
            const x = pad.left + (i / (series.length - 1 || 1)) * cw;
            const y = pad.top + ch - (Math.min(100, val) / 100) * ch;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(pad.left + cw, pad.top + ch); ctx.closePath();
        ctx.fillStyle = color.fill; ctx.fill();
        ctx.beginPath();
        series.forEach((val, i) => {
            const x = pad.left + (i / (series.length - 1 || 1)) * cw;
            const y = pad.top + ch - (Math.min(100, val) / 100) * ch;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color.stroke; ctx.lineWidth = 1.5; ctx.stroke();
    });
}

function updateCharts() {
    if (sysHistoryData.length < 2) return;
    drawSparkline('sysChart', [sysHistoryData.map(d => d.cpu), sysHistoryData.map(d => d.memory)],
        sysHistoryData.map(d => { if (!d.timestamp) return ''; const t = new Date(d.timestamp + 'Z'); return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`; }));
}

async function fetchHistory() {
    try {
        const res = await fetch('/api/read/history');
        const data = await res.json();
        if (data.success && data.history) { sysHistoryData = data.history; if (currentDesktopTab === 'system') updateCharts(); }
    } catch (e) { /* silent */ }
}

function updateCostDisplay() {
    if (!latestDashboard) return;
    const range = document.getElementById('costRange').value;
    const agents = latestDashboard.agents || [];

    // Use the periodic costs from backend if available, otherwise fallback to legacy total cost
    let totalUSD = 0;
    if (range === 'all') {
        totalUSD = agents.reduce((s, a) => s + parseFloat(a.costs?.total ?? a.cost ?? 0), 0);
    } else {
        totalUSD = agents.reduce((s, a) => s + parseFloat(a.costs?.[range] ?? a.cost ?? 0), 0);
    }

    const rangeLabel = { today: '今日', week: '本週', month: '月', all: '全部' }[range] || '月';
    document.getElementById('costLabel').textContent = `${rangeLabel}費用 (TWD)`;
    document.getElementById('totalCost').textContent = formatTWD(totalUSD);
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
        listEl.innerHTML = Object.entries(allModelUsage).sort((a, b) => b[1].cost - a[1].cost)
            .map(([model, u]) => `<div class="model-usage-item"><div><span class="model-usage-name">${esc(model)}</span><span class="model-usage-sessions">(${u.sessions})</span></div><div class="model-usage-stats"><div class="model-usage-tokens">${formatTokens(u.total)}</div><div class="model-usage-cost">${formatTWD(u.cost)}</div></div></div>`).join('')
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
        </div>`;
    switchDesktopTab('detail');
}

function renderDashboard(data) {
    if (!data || !data.success) return;
    latestDashboard = data;
    if (data.exchangeRate) {
        currentExchangeRate = data.exchangeRate;
    }
    const range = document.getElementById('costRange')?.value || 'month';
    const agents = data.agents || [];
    let totalCost = 0, activeCount = 0;

    agents.forEach(a => {
        const prev = previousAgentsMap[a.id];
        if (!prev && a.status?.includes('active')) pushLog(`🟢 ${a.id} 上線 [${a.model}]`, 'info');
        else if (prev && prev.status !== a.status) pushLog(`${a.status?.includes('active') ? '🟢' : '⚪'} ${a.id}: ${prev.status} → ${a.status}`, 'info');
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

    const gridEl = document.getElementById('agentGrid');
    gridEl.innerHTML = agents.map(a => {
        const agentPeriodCost = (range === 'all' ? (a.costs?.total ?? a.cost ?? 0) : (a.costs?.[range] ?? a.cost ?? 0));
        const cost = parseFloat(agentPeriodCost); totalCost += cost;
        if (a.status === 'active_executing' || a.status === 'active_recent') activeCount++;
        const si = getStatusInfo(a.status);
        const taskText = a.currentTask?.task || '';
        const taskLabel = a.currentTask?.label || '';
        const isExecuting = taskLabel === 'EXECUTING';
        const taskHtml = taskText ? `<div class="agent-task-preview">
            <div class="agent-task-header"><span class="agent-task-label ${isExecuting ? 'executing' : 'idle'}">${isExecuting ? '<span class="task-pulse"></span>執行中' : '💤 閒置'}</span></div>
            <div class="agent-task-content" title="${esc(taskText)}">${esc(taskText)}</div></div>` : '';
        return `<div class="agent-card ${si.class}" onclick="showAgentDetail('${esc(a.id)}')">
            <div class="agent-card-header"><div class="agent-card-name"><div class="agent-avatar">${getAgentEmoji(a.id)}</div><div><div class="agent-name">${esc(a.id)}</div><div class="agent-hostname">${esc(a.model || 'N/A')}</div></div></div>
            <div class="agent-status ${si.dotClass}"><span class="agent-status-dot"></span>${si.text}</div></div>
            <div class="agent-card-body"><div class="agent-info-row"><span class="agent-info-label">費用</span><span class="agent-info-value">${formatTWD(cost)}</span></div>
            <div class="agent-info-row"><span class="agent-info-label">Tokens</span><span class="agent-info-value">${formatTokens(a.tokens?.total)}</span></div>
            <div class="agent-info-row"><span class="agent-info-label">活動</span><span class="agent-info-value">${esc(a.lastActivity || '-')}</span></div></div>
            ${taskHtml}
            <div class="agent-card-actions" onclick="event.stopPropagation()">
                <button class="agent-action-btn" onclick="openChat('${esc(a.id)}')">💬 對話</button>
                <button class="agent-action-btn" onclick="openModelModal('${esc(a.id)}', '${esc(a.model || '')}')">🔄 模型</button></div></div>`;
    }).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center;">沒有 Agent</div>';

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

// --- Cron Jobs ---
async function fetchCronJobs() {
    if (isCronLoading) return;
    isCronLoading = true;
    try {
        const res = await fetch('/api/cron/jobs');
        const data = await res.json();
        if (data.success) {
            cronJobs = data.jobs;
            renderCronJobs();
        }
    } catch (e) {
        pushLog('獲取 Cron 任務失敗: ' + e.message, 'err');
    } finally {
        isCronLoading = false;
    }
}

function renderCronJobs() {
    const grid = document.getElementById('cronGrid');
    const badge = document.getElementById('cronCountBadge');
    if (!grid) return;

    badge.textContent = cronJobs.length;

    grid.innerHTML = cronJobs.map(job => {
        const lastRun = job.state?.lastRunAtMs ? fmtTime(new Date(job.state.lastRunAtMs)) : '尚未執行';
        const nextRun = job.state?.nextRunAtMs ? fmtTime(new Date(job.state.nextRunAtMs)) : '未排程';
        const status = job.state?.lastStatus || 'unknown';
        const statusClass = status === 'ok' ? 'online' : (status === 'error' ? 'offline' : 'idle');
        const statusText = status === 'ok' ? '成功' : (status === 'error' ? '失敗' : '未知');

        return `<div class="agent-card ${job.enabled ? '' : 'dormant'}" style="cursor:default">
            <div class="agent-card-header">
                <div class="agent-card-name">
                    <div class="agent-avatar">⏰</div>
                    <div>
                        <div class="agent-name">${esc(job.name)}</div>
                        <div class="agent-hostname">${esc(job.schedule?.expr || 'Once')}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button class="cron-run-button" title="立即執行" onclick="runCronJob('${job.id}')" style="background:var(--green);color:white;border:none;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
                        ▶️ 執行
                    </button>
                    <label class="watchdog-toggle">
                        <input type="checkbox" ${job.enabled ? 'checked' : ''} onchange="toggleCronJob('${job.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="agent-card-body">
                <div class="agent-info-row">
                    <span class="agent-info-label">最後狀態</span>
                    <span class="agent-status ${statusClass}"><span class="agent-status-dot"></span>${statusText}</span>
                </div>
                <div class="agent-info-row">
                    <span class="agent-info-label">上次執行</span>
                    <span class="agent-info-value" style="font-size:11px">${lastRun}</span>
                </div>
                <div class="agent-info-row">
                    <span class="agent-info-label">下次執行</span>
                    <span class="agent-info-value" style="font-size:11px">${nextRun}</span>
                </div>
                <div class="agent-info-row">
                    <span class="agent-info-label">Agent ID</span>
                    <span class="agent-info-value">${esc(job.agentId || 'N/A')}</span>
                </div>
            </div>
            <div class="agent-task-preview" style="margin-top:8px">
                <div class="agent-task-content" style="white-space: pre-wrap; word-break: break-word; max-height: 60px; overflow-y: auto;">${esc(job.description || '無描述')}</div>
            </div>
        </div>`;
    }).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center;grid-column: 1 / -1;">沒有 Cron 任務</div>';
}

async function toggleCronJob(id, enabled) {
    showToast(enabled ? '正在啟用任務...' : '正在停用任務...', 'info');
    try {
        const res = await fetch(`/api/cron/jobs/${id}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            showToast(enabled ? '✅ 任務已啟用' : '⏸ 任務已停用', 'success');
            // Update local state
            const job = cronJobs.find(j => j.id === id);
            if (job) job.enabled = enabled;
            renderCronJobs();
        } else {
            throw new Error(data.error || 'Toggle failed');
        }
    } catch (e) {
        showToast(`❌ 操作失敗: ${e.message}`, 'error');
        // Revert UI if needed (fetching again is safer)
        fetchCronJobs();
    }
}

/**
 * 立即執行指定的 Cron 任務
 * @param {string} id - 任務 ID
 */
async function runCronJob(id) {
    showToast('正在執行任務...', 'info');
    try {
        const res = await fetch(`/api/cron/jobs/${id}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ 任務執行成功', 'success');
            // 刷新任務列表以更新最後執行時間
            fetchCronJobs();
        } else {
            throw new Error(data.error || '執行失敗');
        }
    } catch (e) {
        showToast(`❌ 執行失敗: ${e.message}`, 'error');
        // 可選：刷新列表以確保狀態一致
        fetchCronJobs();
    }
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
    const live = document.getElementById('liveIndicator');
    es.onmessage = (e) => { try { renderDashboard(JSON.parse(e.data)); live.innerHTML = '<span class="live-dot"></span>即時更新'; live.className = 'live-indicator'; } catch (x) { } };
    es.onerror = () => {
        pushLog('串流中斷，5s 後重連...', 'err'); es.close();
        live.innerHTML = '⚠️ 已斷線'; live.style.background = 'var(--red-light)'; live.style.color = 'var(--red)';
        setTimeout(initRealtime, 5000);
    };
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
    if (chatInput) chatInput.addEventListener('input', updateCharCount);
    const sreInput = document.getElementById('sreInput');
    if (sreInput) sreInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendSREFollowUp(); });
    pushLog('OpenClaw Watch Pro v2.0.3 啟動（含 Watchdog）', 'info');
    initRealtime();
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
