// --- Cron Jobs ---
let cronJobs = [];
let isCronLoading = false;

async function fetchCronJobs() {
    if (isCronLoading) return;
    isCronLoading = true;
    try {
        const data = await window.apiClient.get('/api/cron/jobs');
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

    if (cronJobs.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:var(--text-muted);padding:20px;text-align:center;grid-column:1/-1;';
        empty.textContent = '沒有 Cron 任務';
        grid.replaceChildren(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    cronJobs.forEach(job => frag.appendChild(_buildCronCard(job)));
    grid.replaceChildren(frag);
}

function _buildCronCard(job) {
    const lastRun = job.state?.lastRunAtMs ? fmtTime(new Date(job.state.lastRunAtMs)) : '尚未執行';
    const nextRun = job.state?.nextRunAtMs ? fmtTime(new Date(job.state.nextRunAtMs)) : '未排程';
    const status = job.state?.lastStatus || 'unknown';
    const statusClass = status === 'ok' ? 'online' : (status === 'error' ? 'offline' : 'idle');
    const statusText  = status === 'ok' ? '成功' : (status === 'error' ? '失敗' : '未知');

    const card = document.createElement('div');
    card.className = 'agent-card' + (job.enabled ? '' : ' dormant');
    card.style.cursor = 'default';

    // Header
    const header = document.createElement('div');
    header.className = 'agent-card-header';

    const nameBlock = document.createElement('div');
    nameBlock.className = 'agent-card-name';
    const avatar = document.createElement('div');
    avatar.className = 'agent-avatar';
    avatar.textContent = '⏰';
    const nameInfo = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'agent-name';
    nameEl.textContent = job.name;
    const schedEl = document.createElement('div');
    schedEl.className = 'agent-hostname';
    schedEl.textContent = job.schedule?.expr || 'Once';
    nameInfo.append(nameEl, schedEl);
    nameBlock.append(avatar, nameInfo);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const runBtn = document.createElement('button');
    runBtn.className = 'cron-run-button';
    runBtn.title = '立即執行';
    runBtn.textContent = '▶️ 執行';
    runBtn.style.cssText = 'background:var(--green);color:white;border:none;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;';
    runBtn.addEventListener('click', () => runCronJob(job.id));

    const delBtn = document.createElement('button');
    delBtn.title = '刪除任務';
    delBtn.textContent = '🗑';
    delBtn.style.cssText = 'background:rgba(239,68,68,.15);color:#ef4444;border:none;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;';
    delBtn.addEventListener('click', () => deleteCronJob(job.id, job.name));

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'watchdog-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!job.enabled;
    checkbox.addEventListener('change', () => toggleCronJob(job.id, checkbox.checked));
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggleLabel.append(checkbox, slider);

    controls.append(runBtn, delBtn, toggleLabel);
    header.append(nameBlock, controls);

    // Body rows
    const body = document.createElement('div');
    body.className = 'agent-card-body';

    function infoRow(label, valueNode) {
        const row = document.createElement('div');
        row.className = 'agent-info-row';
        const lbl = document.createElement('span');
        lbl.className = 'agent-info-label';
        lbl.textContent = label;
        row.append(lbl, valueNode);
        return row;
    }

    const statusSpan = document.createElement('span');
    statusSpan.className = 'agent-status ' + statusClass;
    const dot = document.createElement('span');
    dot.className = 'agent-status-dot';
    statusSpan.append(dot, document.createTextNode(statusText));

    const lastRunSpan = document.createElement('span');
    lastRunSpan.className = 'agent-info-value';
    lastRunSpan.style.fontSize = '11px';
    lastRunSpan.textContent = lastRun;

    const nextRunSpan = document.createElement('span');
    nextRunSpan.className = 'agent-info-value';
    nextRunSpan.style.fontSize = '11px';
    nextRunSpan.textContent = nextRun;

    const agentIdSpan = document.createElement('span');
    agentIdSpan.className = 'agent-info-value';
    agentIdSpan.textContent = job.agentId || 'N/A';

    body.append(
        infoRow('最後狀態', statusSpan),
        infoRow('上次執行', lastRunSpan),
        infoRow('下次執行', nextRunSpan),
        infoRow('Agent ID', agentIdSpan),
    );

    // Description
    const preview = document.createElement('div');
    preview.className = 'agent-task-preview';
    preview.style.marginTop = '8px';
    const content = document.createElement('div');
    content.className = 'agent-task-content';
    content.style.cssText = 'white-space:pre-wrap;word-break:break-word;max-height:60px;overflow-y:auto;';
    content.textContent = job.description || '無描述';
    preview.appendChild(content);

    card.append(header, body, preview);
    return card;
}

async function toggleCronJob(id, enabled) {
    showToast(enabled ? '正在啟用任務...' : '正在停用任務...', 'info');
    try {
        const data = await window.apiClient.post(`/api/cron/jobs/${id}/toggle`, { enabled });
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

async function deleteCronJob(id, name) {
    if (!confirm(`確認刪除 Cron 任務「${name}」？\n此操作無法復原。`)) return;
    showToast('刪除中...', 'info');
    try {
        const data = await window.apiClient.delete(`/api/cron/jobs/${id}`);
        if (!data.success) throw new Error(data.error || '刪除失敗');
        showToast('✅ 任務已刪除', 'success');
        cronJobs = cronJobs.filter(j => j.id !== id);
        renderCronJobs();
    } catch (e) {
        showToast(`❌ 刪除失敗: ${e.message}`, 'error');
    }
}

/**
 * 立即執行指定的 Cron 任務
 * @param {string} id - 任務 ID
 */
async function runCronJob(id) {
    showToast('正在執行任務...', 'info');
    try {
        const data = await window.apiClient.post(`/api/cron/jobs/${id}/run`);
        if (data.success) {
            showToast(`✅ ${data.message || '任務已觸發（在背景執行中）'}`, 'success');
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
