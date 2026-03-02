// --- Cron Jobs ---
let cronJobs = [];
let isCronLoading = false;

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

