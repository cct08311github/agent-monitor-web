// --- OpenClaw Live Log Streaming ---
(function () {
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

    terminal.innerHTML = '<span class="oc-log-line info">\u9023\u63A5\u4E2D...</span>';
    ocLogSource = window.streamManager.connect('/api/logs/stream', {
        onOpen() {
            if (badge) { badge.textContent = '\u25CF \u76E3\u770B\u4E2D'; badge.className = 'oc-log-badge live'; }
            if (btn) btn.textContent = '\u23F9 \u505C\u6B62\u76E3\u770B';
        },
        onMessage(e) {
            try {
                const { line } = JSON.parse(e.data);
                appendOcLogLine(terminal, line);
            } catch (_) { }
        },
        onError() {
            appendOcLogLine(terminal, '[\u9023\u7DDA\u4E2D\u65B7\uFF0C\u8ACB\u91CD\u65B0\u958B\u59CB\u76E3\u770B]');
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
    if (badge) { badge.textContent = '\u25CF \u5DF2\u505C\u6B62'; badge.className = 'oc-log-badge'; }
    if (btn) btn.textContent = '\u25B6 \u958B\u59CB\u76E3\u770B';
}

function clearOcLog() {
    const terminal = document.getElementById('ocLogTerminal');
    if (terminal) {
        terminal.textContent = '';
        const span = document.createElement('span');
        span.className = 'oc-log-line';
        span.textContent = '\u65E5\u8A8C\u5DF2\u6E05\u9664';
        terminal.appendChild(span);
    }
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

// Expose cross-module and inline-handler symbols
window.toggleOcLog = toggleOcLog;
window.clearOcLog = clearOcLog;
window.setLogFilter = setLogFilter;
window.toggleErrorOnly = toggleErrorOnly;
window.toggleWarnOnly = toggleWarnOnly;
})();
