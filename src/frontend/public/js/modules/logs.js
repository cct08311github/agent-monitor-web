// --- OpenClaw Live Log Streaming ---
let ocLogSource = null;  // EventSource connection
const OC_LOG_MAX_LINES = 500; // Rolling buffer limit

function toggleOcLog() {
    if (ocLogSource) {
        stopOcLog();
    } else {
        startOcLog();
    }
}

function startOcLog() {
    const terminal = document.getElementById('ocLogTerminal');
    const badge = document.getElementById('ocLogStatus');
    const btn = document.getElementById('ocLogToggleBtn');
    if (!terminal) return;

    terminal.innerHTML = '<span class="oc-log-line info">連接中...</span>';
    ocLogSource = new EventSource('/api/logs/stream');

    ocLogSource.onopen = () => {
        if (badge) { badge.textContent = '● 監看中'; badge.className = 'oc-log-badge live'; }
        if (btn) btn.innerHTML = '⏹ 停止監看';
    };

    ocLogSource.onmessage = (e) => {
        try {
            const { line } = JSON.parse(e.data);
            appendOcLogLine(terminal, line);
        } catch (_) { }
    };

    ocLogSource.onerror = () => {
        appendOcLogLine(terminal, '[連線中斷，請重新開始監看]');
        stopOcLog();
    };
}

function stopOcLog() {
    if (ocLogSource) {
        ocLogSource.close();
        ocLogSource = null;
    }
    const badge = document.getElementById('ocLogStatus');
    const btn = document.getElementById('ocLogToggleBtn');
    if (badge) { badge.textContent = '● 已停止'; badge.className = 'oc-log-badge'; }
    if (btn) btn.innerHTML = '▶ 開始監看';
}

function clearOcLog() {
    const terminal = document.getElementById('ocLogTerminal');
    if (terminal) terminal.innerHTML = '<span class="oc-log-line">日誌已清除</span>';
}

function appendOcLogLine(terminal, line) {
    // Classify line for colour coding
    const lower = line.toLowerCase();
    let cls = '';
    if (lower.includes('error') || lower.includes('err ') || lower.includes('[error]')) cls = ' err';
    else if (lower.includes('warn') || lower.includes('[warn]')) cls = ' warn';
    else if (lower.includes('info') || lower.includes('[info]')) cls = ' info';

    const span = document.createElement('span');
    span.className = 'oc-log-line' + cls;
    span.textContent = line;
    terminal.appendChild(span);

    // Rolling buffer: trim oldest lines
    const lines = terminal.querySelectorAll('.oc-log-line');
    if (lines.length > OC_LOG_MAX_LINES) {
        lines[0].remove();
    }

    // Auto-scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
}
