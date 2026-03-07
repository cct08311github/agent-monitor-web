// ========== Chat & Model Switch Module ==========
(function () {
let chatPageAgent = 'main';
let chatPageSending = false;
let chatModalSending = false;
let chatPageInited = false;
let currentTargetAgent = null;
let modelSwitchTarget = null;

// ========== Dedicated Chat Page ==========
function initChatPage() {
    // Populate agent pills from latest dashboard data
    const pillsEl = document.getElementById('chatAgentPills');
    if (!pillsEl) return;
    const agents = latestDashboard?.agents || [];
    // Always include 'main', add others from dashboard
    const agentIds = ['main', ...agents.map(a => a.id).filter(id => id !== 'main')];
    pillsEl.innerHTML = agentIds.map(id => `
        <button class="chat-agent-pill${id === chatPageAgent ? ' active' : ''}" data-agent="${esc(id)}" onclick="selectChatAgent('${esc(id)}')">
            ${getAgentEmoji(id)} ${esc(id)}
        </button>`).join('');

    // Show empty state if no messages yet
    const log = document.getElementById('chatPageLog');
    if (log && !log.children.length) {
        log.innerHTML = `<div class="chat-page-empty">
            <div class="chat-page-empty-icon">\u{1F4AC}</div>
            <div class="chat-page-empty-text">\u8207 <strong>${esc(chatPageAgent)}</strong> \u958B\u59CB\u5C0D\u8A71<br><span style="font-size:12px;opacity:.6">\u8F38\u5165\u8A0A\u606F\u5F8C\u6309 Shift+Enter \u9001\u51FA</span></div>
        </div>`;
    }

    if (!chatPageInited) {
        chatPageInited = true;
        const input = document.getElementById('chatPageInput');
        if (input) {
            input.addEventListener('input', () => {
                const counter = document.getElementById('chatPageCharCount');
                if (counter) counter.textContent = `${input.value.length}/2000`;
                autoGrowTextarea(input);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); sendChatPage(); }
                else if (e.key === 'Enter' && isMobile) { e.preventDefault(); sendChatPage(); }
            });
        }
        // Mobile: round arrow button
        const sendBtn = document.getElementById('chatPageSendBtn');
        if (sendBtn && isMobile) sendBtn.textContent = '\u2191';
    }
}

function selectChatAgent(agentId) {
    chatPageAgent = agentId;
    document.querySelectorAll('.chat-agent-pill').forEach(p =>
        p.classList.toggle('active', p.dataset.agent === agentId));
    // Clear messages and show new empty state
    const log = document.getElementById('chatPageLog');
    if (log) {
        log.innerHTML = `<div class="chat-page-empty">
            <div class="chat-page-empty-icon">${getAgentEmoji(agentId)}</div>
            <div class="chat-page-empty-text">\u8207 <strong>${esc(agentId)}</strong> \u958B\u59CB\u5C0D\u8A71<br><span style="font-size:12px;opacity:.6">\u8F38\u5165\u8A0A\u606F\u5F8C\u6309 Shift+Enter \u9001\u51FA</span></div>
        </div>`;
    }
    document.getElementById('chatPageInput')?.focus();
}

async function sendChatPage() {
    if (chatPageSending) return;
    const input = document.getElementById('chatPageInput');
    const msg = input?.value.trim();
    if (!msg) return;
    if (msg.length > 2000) { showToast('\u274C \u8A0A\u606F\u8D85\u904E 2000 \u5B57', 'error'); return; }
    if (!chatPageAgent || !/^[A-Za-z0-9_-]+$/.test(chatPageAgent)) { showToast('\u274C \u7121\u6548\u7684 Agent ID', 'error'); return; }

    chatPageSending = true;
    const log = document.getElementById('chatPageLog');
    // Remove empty state if present
    log.querySelector('.chat-page-empty')?.remove();

    appendChatPageMsg(log, msg, 'user');
    input.value = '';
    input.style.height = 'auto';
    log.scrollTop = log.scrollHeight;

    // Typing indicator
    const typingId = `typing-${Date.now()}`;
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'chat-msg agent';
    const typingSpan = document.createElement('span');
    typingSpan.style.opacity = '.5';
    typingSpan.textContent = '\u00B7\u00B7\u00B7';
    typingEl.appendChild(typingSpan);
    log.appendChild(typingEl);
    log.scrollTop = log.scrollHeight;

    try {
        const data = await window.apiClient.post('/api/command', {
            command: 'talk',
            agentId: chatPageAgent,
            message: msg
        });
        document.getElementById(typingId)?.remove();
        appendChatPageMsg(log, data.output, 'agent');
    } catch (e) {
        document.getElementById(typingId)?.remove();
        appendChatPageMsg(log, `\u274C ${e.message}`, 'error');
        pushLog(`ChatPage error (${chatPageAgent}): ${e.message}`, 'err');
    }
    chatPageSending = false;
    log.scrollTop = log.scrollHeight;
}

function appendChatPageMsg(log, text, type) {
    const el = document.createElement('div');
    el.className = `chat-msg ${type}`;
    el.textContent = text;
    log.appendChild(el);
}


// --- Chat ---
function openChat(agentId) {
    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) { showToast('\u274C \u7121\u6548\u7684 Agent ID', 'error'); return; }
    currentTargetAgent = agentId;
    // Title: show full name on desktop, compact on mobile
    const emoji = getAgentEmoji(agentId);
    const titleEl = document.getElementById('chatTitle');
    titleEl.textContent = '';
    titleEl.append(emoji + ' ');
    const strong = document.createElement('strong');
    strong.textContent = agentId;
    titleEl.appendChild(strong);
    const log = document.getElementById('chatLog');
    log.textContent = '';
    const input = document.getElementById('chatInput');
    input.value = '';
    input.style.height = 'auto';
    updateCharCount();
    // Update send button icon for mobile
    const sendBtn = document.querySelector('#chatModal .chat-send');
    if (sendBtn) sendBtn.textContent = isMobile ? '\u2191' : '\u767C\u9001';
    document.getElementById('chatModal').style.display = 'flex';
    // Small delay to let modal render before focusing (critical for iOS keyboard)
    setTimeout(() => {
        input.focus();
        log.scrollTop = log.scrollHeight;
    }, 100);

    // Auto-send "hi"
    const sysDiv = document.createElement('div');
    sysDiv.className = 'chat-msg system';
    sysDiv.textContent = `\u6B63\u5728\u9023\u63A5 ${agentId}...`;
    log.appendChild(sysDiv);
    autoSendHi(agentId);
}

async function autoSendHi(agentId) {
    const log = document.getElementById('chatLog');
    try {
        const data = await window.apiClient.post('/api/command', {
            command: 'talk',
            agentId: agentId,
            message: 'hi'
        });
        const sysMsg = log.querySelector('.chat-msg.system');
        if (sysMsg) sysMsg.remove();
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg user';
        userDiv.textContent = 'hi';
        log.appendChild(userDiv);
        const agentDiv = document.createElement('div');
        agentDiv.className = 'chat-msg agent';
        agentDiv.textContent = data.output;
        log.appendChild(agentDiv);
    } catch (e) {
        const sysMsg = log.querySelector('.chat-msg.system');
        if (sysMsg) sysMsg.remove();
        const payload = e && e.payload ? e.payload : null;
        let message = e.message;
        if (payload && payload._debug_host) message += ` (host: ${payload._debug_host})`;
        if (payload && payload._debug_origin) message += ` (origin: ${payload._debug_origin})`;
        const errDiv = document.createElement('div');
        errDiv.className = 'chat-msg error';
        errDiv.textContent = `\u274C \u9023\u63A5\u5931\u6557: ${message}`;
        log.appendChild(errDiv);
        pushLog(`Chat error (${agentId}): ${message}`, 'err');
    }
    log.scrollTop = log.scrollHeight;
}

function closeChat() { document.getElementById('chatModal').style.display = 'none'; }

function updateCharCount() {
    const input = document.getElementById('chatInput');
    const counter = document.getElementById('chatCharCount');
    if (input && counter) counter.textContent = `${input.value.length}/2000`;
}

function autoGrowTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

async function sendChat() {
    if (chatModalSending) return;
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.length > 2000) { showToast('\u274C \u8A0A\u606F\u8D85\u904E 2000 \u5B57', 'error'); return; }
    if (!currentTargetAgent || !/^[A-Za-z0-9_-]+$/.test(currentTargetAgent)) { showToast('\u274C \u7121\u6548\u7684 Agent ID', 'error'); return; }

    chatModalSending = true;
    const log = document.getElementById('chatLog');
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.textContent = msg;
    log.appendChild(userDiv);
    input.value = '';
    input.style.height = 'auto'; // Reset textarea height
    updateCharCount();
    log.scrollTop = log.scrollHeight;

    try {
        const data = await window.apiClient.post('/api/command', {
            command: 'talk',
            agentId: currentTargetAgent,
            message: msg
        });
        const agentDiv = document.createElement('div');
        agentDiv.className = 'chat-msg agent';
        agentDiv.textContent = data.output;
        log.appendChild(agentDiv);
    } catch (e) {
        const payload = e && e.payload ? e.payload : null;
        let message = e.message;
        if (payload && payload._debug_host) message += ` (host: ${payload._debug_host})`;
        const errDiv = document.createElement('div');
        errDiv.className = 'chat-msg error';
        errDiv.textContent = `\u274C ${message}`;
        log.appendChild(errDiv);
        pushLog(`Chat error (${currentTargetAgent}): ${message}`, 'err');
    }
    chatModalSending = false;
    log.scrollTop = log.scrollHeight;
}


// --- Model Switch ---
function openModelModal(agentId, currentModel) {
    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) { showToast('\u274C \u7121\u6548\u7684 Agent ID', 'error'); return; }
    modelSwitchTarget = agentId;
    document.getElementById('modelCurrentInfo').textContent = `Agent: ${agentId} | \u76EE\u524D\u6A21\u578B: ${currentModel || '\u672A\u77E5'}`;
    document.getElementById('modelModal').style.display = 'flex';
}
function closeModelModal() { document.getElementById('modelModal').style.display = 'none'; }

async function confirmModelSwitch() {
    const model = document.getElementById('modelSelect').value;
    if (!modelSwitchTarget || !model) return;
    if (!/^[A-Za-z0-9._/-]+$/.test(model)) { showToast('\u274C \u7121\u6548\u7684\u6A21\u578B\u540D\u7A31', 'error'); return; }
    closeModelModal();
    showToast(`\u6B63\u5728\u5207\u63DB ${modelSwitchTarget} \u2192 ${model}...`, 'info');
    try {
        const data = await window.apiClient.post('/api/command', {
            command: 'switch-model',
            agentId: modelSwitchTarget,
            model
        });
        showToast(`\u2705 ${modelSwitchTarget} \u5DF2\u5207\u63DB\u81F3 ${model}`, 'success');
        pushLog(`Model switched: ${modelSwitchTarget} \u2192 ${model}`, 'info');
        await update(true);
        if (currentDesktopTab === 'detail' && modelSwitchTarget) {
            showAgentDetail(modelSwitchTarget);
        }
    } catch (e) {
        showToast(`\u274C \u5207\u63DB\u5931\u6557: ${e.message}`, 'error');
        pushLog(`Model switch failed: ${e.message}`, 'err');
    }
}

// Expose cross-module and inline-handler symbols
window.initChatPage = initChatPage;
window.selectChatAgent = selectChatAgent;
window.sendChatPage = sendChatPage;
window.openChat = openChat;
window.closeChat = closeChat;
window.updateCharCount = updateCharCount;
window.autoGrowTextarea = autoGrowTextarea;
window.sendChat = sendChat;
window.openModelModal = openModelModal;
window.closeModelModal = closeModelModal;
window.confirmModelSwitch = confirmModelSwitch;
})();
