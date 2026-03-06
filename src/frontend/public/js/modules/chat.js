// ========== Chat & Model Switch Module ==========
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
            <div class="chat-page-empty-icon">💬</div>
            <div class="chat-page-empty-text">與 <strong>${esc(chatPageAgent)}</strong> 開始對話<br><span style="font-size:12px;opacity:.6">輸入訊息後按 Shift+Enter 送出</span></div>
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
        if (sendBtn && isMobile) sendBtn.innerHTML = '↑';
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
            <div class="chat-page-empty-text">與 <strong>${esc(agentId)}</strong> 開始對話<br><span style="font-size:12px;opacity:.6">輸入訊息後按 Shift+Enter 送出</span></div>
        </div>`;
    }
    document.getElementById('chatPageInput')?.focus();
}

async function sendChatPage() {
    if (chatPageSending) return;
    const input = document.getElementById('chatPageInput');
    const msg = input?.value.trim();
    if (!msg) return;
    if (msg.length > 2000) { showToast('❌ 訊息超過 2000 字', 'error'); return; }
    if (!chatPageAgent || !/^[A-Za-z0-9_-]+$/.test(chatPageAgent)) { showToast('❌ 無效的 Agent ID', 'error'); return; }

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
    typingEl.innerHTML = '<span style="opacity:.5">···</span>';
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
        appendChatPageMsg(log, `❌ ${e.message}`, 'error');
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
    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) { showToast('❌ 無效的 Agent ID', 'error'); return; }
    currentTargetAgent = agentId;
    // Title: show full name on desktop, compact on mobile
    const emoji = getAgentEmoji(agentId);
    document.getElementById('chatTitle').innerHTML = `${emoji} <strong>${agentId}</strong>`;
    const log = document.getElementById('chatLog');
    log.innerHTML = '';
    const input = document.getElementById('chatInput');
    input.value = '';
    input.style.height = 'auto';
    updateCharCount();
    // Update send button icon for mobile
    const sendBtn = document.querySelector('#chatModal .chat-send');
    if (sendBtn) sendBtn.innerHTML = isMobile ? '↑' : '發送';
    document.getElementById('chatModal').style.display = 'flex';
    // Small delay to let modal render before focusing (critical for iOS keyboard)
    setTimeout(() => {
        input.focus();
        log.scrollTop = log.scrollHeight;
    }, 100);

    // Auto-send "hi"
    log.innerHTML += `<div class="chat-msg system">正在連接 ${agentId}...</div>`;
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
        log.innerHTML += `<div class="chat-msg user">hi</div>`;
        log.innerHTML += `<div class="chat-msg agent">${esc(data.output)}</div>`;
    } catch (e) {
        const sysMsg = log.querySelector('.chat-msg.system');
        if (sysMsg) sysMsg.remove();
        const payload = e && e.payload ? e.payload : null;
        let message = e.message;
        if (payload && payload._debug_host) message += ` (host: ${payload._debug_host})`;
        if (payload && payload._debug_origin) message += ` (origin: ${payload._debug_origin})`;
        log.innerHTML += `<div class="chat-msg error">❌ 連接失敗: ${esc(message)}</div>`;
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
    if (msg.length > 2000) { showToast('❌ 訊息超過 2000 字', 'error'); return; }
    if (!currentTargetAgent || !/^[A-Za-z0-9_-]+$/.test(currentTargetAgent)) { showToast('❌ 無效的 Agent ID', 'error'); return; }

    chatModalSending = true;
    const log = document.getElementById('chatLog');
    log.innerHTML += `<div class="chat-msg user">${esc(msg)}</div>`;
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
        log.innerHTML += `<div class="chat-msg agent">${esc(data.output)}</div>`;
    } catch (e) {
        const payload = e && e.payload ? e.payload : null;
        let message = e.message;
        if (payload && payload._debug_host) message += ` (host: ${payload._debug_host})`;
        log.innerHTML += `<div class="chat-msg error">❌ ${esc(message)}</div>`;
        pushLog(`Chat error (${currentTargetAgent}): ${message}`, 'err');
    }
    chatModalSending = false;
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
        const data = await window.apiClient.post('/api/command', {
            command: 'switch-model',
            agentId: modelSwitchTarget,
            model
        });
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
