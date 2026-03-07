// --- OpenClaw Live Log Streaming ---
let ocLogSource = null;  // EventSource connection
const OC_LOG_MAX_LINES = 500; // Rolling buffer limit

const LOG_BUFFER_MAX = 500;
let logBuffer = [];
let logFilterText = '';
let logShowError = false;
let logShowWarn = false;

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
    ocLogSource = window.streamManager.connect('/api/logs/stream', {
        onOpen() {
            if (badge) { badge.textContent = '● 監看中'; badge.className = 'oc-log-badge live'; }
            if (btn) btn.innerHTML = '⏹ 停止監看';
        },
        onMessage(e) {
            try {
                const { line } = JSON.parse(e.data);
                appendOcLogLine(terminal, line);
            } catch (_) { }
        },
        onError() {
            appendOcLogLine(terminal, '[連線中斷，請重新開始監看]');
            stopOcLog();
        },
        autoReconnect: false
    });
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
    const level = detectLineLevel(line);
    logBuffer.push({ line, level });
    if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
    if (!lineMatchesFilter(line)) return;

    // Classify line for colour coding (legacy span classes kept for compatibility)
    const lower = line.toLowerCase();
    let cls = '';
    if (lower.includes('error') || lower.includes('err ') || lower.includes('[error]')) cls = ' err';
    else if (lower.includes('warn') || lower.includes('[warn]')) cls = ' warn';
    else if (lower.includes('info') || lower.includes('[info]')) cls = ' info';

    const div = document.createElement('div');
    div.className = `log-line ${level} oc-log-line${cls}`;
    div.appendChild(buildHighlightedNode(line, logFilterText));
    terminal.appendChild(div);

    // Rolling buffer: trim oldest lines
    const lines = terminal.querySelectorAll('.oc-log-line');
    if (lines.length > OC_LOG_MAX_LINES) {
        lines[0].remove();
    }

    // Auto-scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
}

function detectLineLevel(line) {
    const l = line.toUpperCase();
    if (l.includes('ERROR') || l.includes(' ERR ') || l.includes('[ERR]')) return 'error';
    if (l.includes('WARN')) return 'warn';
    return 'info';
}

function lineMatchesFilter(line) {
    const level = detectLineLevel(line);
    if (logShowError && level !== 'error') return false;
    if (logShowWarn && !['error', 'warn'].includes(level)) return false;
    if (logFilterText && !line.toLowerCase().includes(logFilterText.toLowerCase())) return false;
    return true;
}

// Safe DOM highlight — no innerHTML with user input
function buildHighlightedNode(text, keyword) {
    const frag = document.createDocumentFragment();
    if (!keyword) { frag.appendChild(document.createTextNode(text)); return frag; }
    const lower = text.toLowerCase();
    const kLower = keyword.toLowerCase();
    let pos = 0;
    while (pos < text.length) {
        const idx = lower.indexOf(kLower, pos);
        if (idx === -1) { frag.appendChild(document.createTextNode(text.slice(pos))); break; }
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(idx, idx + keyword.length);
        frag.appendChild(mark);
        pos = idx + keyword.length;
    }
    return frag;
}

function applyLogFilter() {
    const terminal = document.getElementById('ocLogTerminal');
    if (!terminal) return;
    while (terminal.firstChild) terminal.removeChild(terminal.firstChild);
    logBuffer.filter(e => lineMatchesFilter(e.line)).forEach(e => {
        const div = document.createElement('div');
        const cls = e.level === 'error' ? ' err' : e.level === 'warn' ? ' warn' : ' info';
        div.className = `log-line ${e.level} oc-log-line${cls}`;
        div.appendChild(buildHighlightedNode(e.line, logFilterText));
        terminal.appendChild(div);
    });
    terminal.scrollTop = terminal.scrollHeight;
}

function setLogFilter(text) { logFilterText = text; applyLogFilter(); }

function toggleErrorOnly() {
    logShowError = !logShowError;
    if (logShowError) logShowWarn = false;
    document.getElementById('logFilterError')?.classList.toggle('active-error', logShowError);
    document.getElementById('logFilterWarn')?.classList.remove('active-warn');
    applyLogFilter();
}

function toggleWarnOnly() {
    logShowWarn = !logShowWarn;
    if (logShowWarn) logShowError = false;
    document.getElementById('logFilterWarn')?.classList.toggle('active-warn', logShowWarn);
    document.getElementById('logFilterError')?.classList.remove('active-error');
    applyLogFilter();
}
