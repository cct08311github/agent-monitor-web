/* ================================================
   OpenClaw Watch Pro v2.0.2
   Fixes:
   1) forbidden_host debug info + better error display
   2) Dismiss errors properly (suppress until changed)
   3) Error timestamps
   4) SRE response panel with follow-up conversation
   ================================================ */

(function () {

function onAgentSearch(val) { agentSearchQuery = (val || '').trim(); if (latestDashboard) renderDashboard(latestDashboard); }

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

function showToast(msg, type = 'info', opts) {
    if (window.ToastManager) {
        ToastManager.show(msg, type, opts);
        return;
    }
    // Fallback to legacy toast
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
        case 'active_executing': return { class: 'running', text: '執行中', dotClass: 'online', icon: '▶' };
        case 'active_recent': return { class: 'active', text: '活動中', dotClass: 'online', icon: '●' };
        case 'dormant': return { class: 'dormant', text: '休眠中', dotClass: 'idle', icon: '◐' };
        default: return { class: '', text: '離線', dotClass: 'offline', icon: '○' };
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

// --- Data ---
async function update(force = false) {
    try {
        const data = await window.apiClient.get(force ? `/api/read/dashboard?force=1&t=${Date.now()}` : '/api/read/dashboard');
        renderDashboard(data);
    } catch (e) {
        pushLog('連線中斷...', 'err');
    }
}

function handleError(error, context) {
    var msg = (error && error.message) || '未知錯誤';
    var ctx = context || '';
    pushLog('❌ ' + (ctx ? '[' + ctx + '] ' : '') + msg, 'err');
    showToast('❌ ' + (ctx ? ctx + ': ' : '') + msg, 'error');
}

// --- Expose cross-module / inline-handler symbols ---
window.onAgentSearch = onAgentSearch;
window.esc = esc;
window.formatTokens = formatTokens;
window.formatTWD = formatTWD;
window.fmtTime = fmtTime;
window.showToast = showToast;
window.getAgentEmoji = getAgentEmoji;
window.getStatusInfo = getStatusInfo;
window.pushLog = pushLog;
window.update = update;
window.handleError = handleError;

})();
