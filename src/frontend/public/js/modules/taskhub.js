// ═══════════════════════════════════════════════
// TaskHub Module
// ═══════════════════════════════════════════════

let thDomain = 'all';
let thTasks = [];
let thSearchTimer = null;

const TH_STATUS_MAP = {
    not_started: { label: '未開始', cls: 'th-s-idle' },
    in_progress:  { label: '進行中', cls: 'th-s-active' },
    blocked:      { label: '封鎖中', cls: 'th-s-blocked' },
    draft:        { label: '草稿',   cls: 'th-s-idle' },
    done:         { label: '已完成', cls: 'th-s-done' },
    archived:     { label: '已封存', cls: 'th-s-muted' },
    cancelled:    { label: '已取消', cls: 'th-s-muted' },
};

const TH_PRIORITY_MAP = {
    urgent: { label: '🔴 緊急', cls: 'th-p-urgent' },
    high:   { label: '🟠 高',   cls: 'th-p-high' },
    medium: { label: '🟡 中',   cls: 'th-p-medium' },
    low:    { label: '🟢 低',   cls: 'th-p-low' },
};

const TH_DOMAIN_EMOJI = { work: '💼', personal: '🏠', sideproject: '🚀' };

function setThDomain(domain) {
    thDomain = domain;
    document.querySelectorAll('.th-domain-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.domain === domain));
    fetchTasks();
}

function debounceThSearch() {
    clearTimeout(thSearchTimer);
    thSearchTimer = setTimeout(fetchTasks, 400);
}

async function fetchTaskhubStats() {
    try {
        const res = await fetch('/api/taskhub/stats');
        const data = await res.json();
        if (!data.success) return;
        renderTaskhubStats(data.stats);
    } catch (e) {
        pushLog('TaskHub stats error: ' + e.message, 'err');
    }
}

function renderTaskhubStats(stats) {
    const bar = document.getElementById('taskhubStats');
    if (!bar) return;

    const domains = ['work', 'personal', 'sideproject'];
    const domainLabels = { work: '💼 Work', personal: '🏠 Personal', sideproject: '🚀 SideProject' };

    const cards = domains.map(d => {
        const s = stats.domains[d] || {};
        const inProgress = s.by_status?.in_progress || 0;
        const blocked = s.by_status?.blocked || 0;
        return `<div class="th-stat-card">
            <span class="th-stat-domain">${domainLabels[d]}</span>
            <span class="th-stat-active">${s.active || 0} 待辦</span>
            ${inProgress ? `<span class="th-s-active th-stat-badge">${inProgress} 進行中</span>` : ''}
            ${blocked ? `<span class="th-s-blocked th-stat-badge">${blocked} 封鎖</span>` : ''}
        </div>`;
    }).join('');

    const totalBadge = document.getElementById('taskhubCountBadge');
    if (totalBadge) totalBadge.textContent = stats.total_active || 0;

    bar.innerHTML = `<div class="th-stat-row">${cards}</div>`;
}

async function fetchTasks() {
    const status = document.getElementById('thStatusFilter')?.value || '';
    const priority = document.getElementById('thPriorityFilter')?.value || '';
    const search = document.getElementById('thSearch')?.value?.trim() || '';

    const params = new URLSearchParams({ domain: thDomain, limit: 100 });
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (search) params.set('search', search);

    const grid = document.getElementById('taskhubGrid');
    if (grid) grid.innerHTML = '<div class="th-loading">載入中...</div>';

    try {
        const res = await fetch('/api/taskhub/tasks?' + params);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        thTasks = data.tasks;
        renderTasks(thTasks);
    } catch (e) {
        if (grid) grid.innerHTML = `<div class="th-empty">❌ 載入失敗: ${esc(e.message)}</div>`;
        pushLog('TaskHub fetch error: ' + e.message, 'err');
    }
}

function renderTasks(tasks) {
    const grid = document.getElementById('taskhubGrid');
    if (!grid) return;

    if (!tasks || tasks.length === 0) {
        grid.innerHTML = '<div class="th-empty">沒有符合的任務</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'th-task-table';

    const thead = table.createTHead();
    const hRow = thead.insertRow();
    ['優先', '標題', '狀態', 'Domain', '專案', '到期', '操作'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        hRow.appendChild(th);
    });

    const tbody = table.createTBody();
    tasks.forEach(t => tbody.appendChild(_buildTaskRow(t)));

    grid.replaceChildren(table);
}

function _buildTaskRow(t) {
    const sm = TH_STATUS_MAP[t.status] || { label: t.status, cls: '' };
    const pm = TH_PRIORITY_MAP[t.priority] || { label: t.priority, cls: '' };
    const domEmoji = TH_DOMAIN_EMOJI[t.domain] || '📋';

    const tr = document.createElement('tr');
    tr.className = 'th-task-row';
    tr.addEventListener('click', () => openTaskDetail(t.domain, t.id));

    // Priority
    const tdPri = document.createElement('td');
    tdPri.className = 'th-col-priority';
    const priSpan = document.createElement('span');
    priSpan.className = 'th-priority-badge ' + pm.cls;
    priSpan.textContent = pm.label;
    tdPri.appendChild(priSpan);

    // Title + notes preview
    const tdTitle = document.createElement('td');
    tdTitle.className = 'th-col-title';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'th-row-title';
    titleSpan.textContent = t.title;
    tdTitle.appendChild(titleSpan);
    if (t.notes) {
        const notesSpan = document.createElement('span');
        notesSpan.className = 'th-row-notes';
        notesSpan.textContent = t.notes.slice(0, 60) + (t.notes.length > 60 ? '…' : '');
        tdTitle.appendChild(notesSpan);
    }

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'th-col-status';
    const statusSpan = document.createElement('span');
    statusSpan.className = 'th-status-badge ' + sm.cls;
    statusSpan.textContent = sm.label;
    tdStatus.appendChild(statusSpan);

    // Domain
    const tdDomain = document.createElement('td');
    tdDomain.className = 'th-col-domain';
    const domSpan = document.createElement('span');
    domSpan.className = 'th-domain-badge';
    domSpan.textContent = domEmoji + ' ' + t.domain;
    tdDomain.appendChild(domSpan);

    // Project + GitHub link
    const tdProject = document.createElement('td');
    tdProject.className = 'th-col-project';
    if (t.project) {
        const projSpan = document.createElement('span');
        projSpan.className = 'th-project';
        projSpan.textContent = t.project;
        tdProject.appendChild(projSpan);
    }
    if (t.github_issue_id) {
        if (t.project) tdProject.append(' ');
        const ghLink = document.createElement('a');
        ghLink.className = 'th-gh-link';
        ghLink.href = 'https://github.com/' + (t.github_repo || '') + '/issues/' + t.github_issue_id;
        ghLink.target = '_blank';
        ghLink.title = 'GitHub Issue';
        ghLink.textContent = '#' + t.github_issue_id;
        tdProject.appendChild(ghLink);
    }
    if (!t.project && !t.github_issue_id) {
        const empty = document.createElement('span');
        empty.className = 'th-due-empty';
        empty.textContent = '—';
        tdProject.appendChild(empty);
    }

    // Due date
    const tdDue = document.createElement('td');
    tdDue.className = 'th-col-due';
    if (t.due_date) {
        const dueSpan = document.createElement('span');
        dueSpan.className = 'th-due' + (isDueUrgent(t.due_date) ? ' th-due-urgent' : '');
        dueSpan.textContent = '📅 ' + t.due_date;
        tdDue.appendChild(dueSpan);
    } else {
        const emptyDue = document.createElement('span');
        emptyDue.className = 'th-due-empty';
        emptyDue.textContent = '—';
        tdDue.appendChild(emptyDue);
    }

    // Action buttons
    const tdActions = document.createElement('td');
    tdActions.className = 'th-col-actions';
    tdActions.addEventListener('click', e => e.stopPropagation());
    _appendActionButtons(tdActions, t);

    tr.append(tdPri, tdTitle, tdStatus, tdDomain, tdProject, tdDue, tdActions);
    return tr;
}

function _appendActionButtons(container, task) {
    function mkBtn(cls, text, onClickFn) {
        const btn = document.createElement('button');
        btn.className = 'th-action-btn ' + cls;
        btn.textContent = text;
        btn.addEventListener('click', onClickFn);
        container.appendChild(btn);
    }
    if (task.status === 'not_started')
        mkBtn('th-btn-start', '▶ 開始', () => quickUpdateStatus(task.domain, task.id, 'in_progress'));
    if (task.status === 'in_progress') {
        mkBtn('th-btn-done',  '✓ 完成', () => quickUpdateStatus(task.domain, task.id, 'done'));
        mkBtn('th-btn-block', '⛔ 封鎖', () => quickUpdateStatus(task.domain, task.id, 'blocked'));
    }
    if (task.status === 'blocked')
        mkBtn('th-btn-start', '▶ 恢復', () => quickUpdateStatus(task.domain, task.id, 'in_progress'));
    if (!['done', 'archived', 'cancelled'].includes(task.status))
        mkBtn('th-btn-edit', '✏️ 編輯', () => openTaskDetail(task.domain, task.id));
}

function isDueUrgent(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    const diff = (due - new Date()) / (1000 * 60 * 60 * 24);
    return diff <= 2;
}

async function quickUpdateStatus(domain, id, status) {
    showToast(`更新狀態 → ${TH_STATUS_MAP[status]?.label || status}...`, 'info');
    try {
        const res = await fetch(`/api/taskhub/tasks/${domain}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast(`✅ 已更新為「${TH_STATUS_MAP[status]?.label || status}」`, 'success');
        // Update local state & re-render
        const idx = thTasks.findIndex(t => t.id === id);
        if (idx >= 0) { thTasks[idx] = data.task; renderTasks(thTasks); }
        fetchTaskhubStats();
    } catch (e) {
        showToast(`❌ 更新失敗: ${e.message}`, 'error');
    }
}

function closeTaskDetailModal() {
    document.getElementById('taskDetailModal').style.display = 'none';
}

function openTaskDetail(domain, id) {
    const task = thTasks.find(t => t.id === id && t.domain === domain);
    if (!task) return;

    document.getElementById('taskDetailTitle').textContent = `${TH_DOMAIN_EMOJI[task.domain] || '📋'} ${task.title}`;

    const tagsStr = (task.tags || []).join(', ');
    const notionBadge = task.notion_dirty
        ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(249,115,22,.15);color:#f97316">待同步</span>`
        : `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,.15);color:#22c55e">已同步</span>`;

    const ghFields = domain === 'sideproject' ? `
        <div class="th-form-row"><label>GitHub Repo</label>
            <input id="editGhRepo" type="text" value="${esc(task.github_repo || '')}" placeholder="cct08311github/repo-name">
        </div>
        <div style="display:flex;gap:8px">
            <div class="th-form-row" style="flex:1"><label>Issue #</label>
                <input id="editGhIssue" type="number" min="0" value="${task.github_issue_id || ''}">
            </div>
            <div class="th-form-row" style="flex:1"><label>PR #</label>
                <input id="editGhPr" type="number" min="0" value="${task.github_pr_id || ''}">
            </div>
        </div>
        <div class="th-form-row"><label>Branch</label>
            <input id="editGhBranch" type="text" value="${esc(task.github_branch || '')}" placeholder="feat/...">
        </div>
        <div class="th-form-row"><label>Dev Status</label>
            <select id="editDevStatus">
                ${['planning','in_dev','code_review','testing','done'].map(v =>
                    `<option value="${v}" ${task.dev_status === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
        </div>` : '';

    const assigneeField = domain === 'work' ? `
        <div class="th-form-row"><label>Assignee</label>
            <input id="editAssignee" type="text" value="${esc(task.assignee || '')}" placeholder="負責人">
        </div>` : '';

    const projectField = domain !== 'personal' ? `
        <div class="th-form-row"><label>專案</label>
            <input id="editProject" type="text" value="${esc(task.project || '')}" placeholder="專案名稱">
        </div>` : '';

    document.getElementById('taskDetailBody').innerHTML = `
        <div class="detail-card">
            <div class="detail-card-title">基本資訊
                <span style="float:right;font-size:11px;font-weight:400">Notion: ${notionBadge}</span>
            </div>
            <div class="th-form-row"><label>標題</label>
                <input id="editTitle" type="text" value="${esc(task.title)}">
            </div>
            <div style="display:flex;gap:8px">
                <div class="th-form-row" style="flex:1"><label>狀態</label>
                    <select id="editStatus">
                        ${Object.entries(TH_STATUS_MAP).map(([v, s]) =>
                            `<option value="${v}" ${task.status === v ? 'selected' : ''}>${s.label}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="th-form-row" style="flex:1"><label>優先度</label>
                    <select id="editPriority">
                        ${Object.entries(TH_PRIORITY_MAP).map(([v, p]) =>
                            `<option value="${v}" ${task.priority === v ? 'selected' : ''}>${p.label}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="th-form-row"><label>到期日</label>
                <input id="editDueDate" type="date" value="${esc(task.due_date || '')}">
            </div>
            ${projectField}
            ${assigneeField}
            <div class="th-form-row"><label>標籤（逗號分隔）</label>
                <input id="editTags" type="text" value="${esc(tagsStr)}" placeholder="tag1, tag2">
            </div>
            <div class="th-form-row"><label>備註</label>
                <textarea id="editNotes" rows="3">${esc(task.notes || '')}</textarea>
            </div>
            ${domain === 'sideproject' ? '<div class="detail-card-title" style="margin-top:12px">GitHub 整合</div>' : ''}
            ${ghFields}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="ctrl-btn accent" style="flex:1" onclick="saveTaskEdit('${esc(domain)}','${esc(task.id)}')">💾 儲存</button>
            <button class="ctrl-btn" style="flex:1;background:var(--red-light,rgba(239,68,68,.1));color:#ef4444"
                onclick="confirmDeleteTask('${esc(domain)}','${esc(task.id)}','${esc(task.title.replace(/'/g, "\\'"))}')">🗑 刪除</button>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
            建立 ${esc((task.created_at || '').slice(0, 16))} ／ 更新 ${esc((task.updated_at || '').slice(0, 16))}
        </div>
    `;

    document.getElementById('taskDetailModal').style.display = 'flex';
}

async function saveTaskEdit(domain, id) {
    const body = {
        title:    document.getElementById('editTitle')?.value.trim(),
        status:   document.getElementById('editStatus')?.value,
        priority: document.getElementById('editPriority')?.value,
        due_date: document.getElementById('editDueDate')?.value || null,
        notes:    document.getElementById('editNotes')?.value || null,
    };

    const tagsRaw = document.getElementById('editTags')?.value || '';
    body.tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (domain !== 'personal') body.project = document.getElementById('editProject')?.value || null;
    if (domain === 'work')     body.assignee = document.getElementById('editAssignee')?.value || null;
    if (domain === 'sideproject') {
        body.github_repo     = document.getElementById('editGhRepo')?.value || null;
        body.github_issue_id = document.getElementById('editGhIssue')?.value || null;
        body.github_pr_id    = document.getElementById('editGhPr')?.value || null;
        body.github_branch   = document.getElementById('editGhBranch')?.value || null;
        body.dev_status      = document.getElementById('editDevStatus')?.value || null;
    }

    if (!body.title) { showToast('❌ 標題不可空白', 'error'); return; }

    showToast('儲存中...', 'info');
    try {
        const res = await fetch(`/api/taskhub/tasks/${domain}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast('✅ 已儲存', 'success');
        const idx = thTasks.findIndex(t => t.id === id);
        if (idx >= 0) thTasks[idx] = data.task;
        closeTaskDetailModal();
        renderTasks(thTasks);
        fetchTaskhubStats();
    } catch (e) {
        showToast(`❌ 儲存失敗: ${e.message}`, 'error');
    }
}

async function confirmDeleteTask(domain, id, title) {
    if (!confirm(`確認刪除任務「${title}」？\n此操作無法復原。`)) return;
    showToast('刪除中...', 'info');
    try {
        const res = await fetch(`/api/taskhub/tasks/${domain}/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast(`✅ 任務已刪除`, 'success');
        thTasks = thTasks.filter(t => !(t.id === id && t.domain === domain));
        closeTaskDetailModal();
        renderTasks(thTasks);
        fetchTaskhubStats();
    } catch (e) {
        showToast(`❌ 刪除失敗: ${e.message}`, 'error');
    }
}

function openAddTaskModal() {
    // Pre-select current domain
    const sel = document.getElementById('addTaskDomain');
    if (sel && thDomain !== 'all') sel.value = thDomain;
    document.getElementById('addTaskTitle').value = '';
    document.getElementById('addTaskNotes').value = '';
    document.getElementById('addTaskDueDate').value = '';
    document.getElementById('addTaskProject').value = '';
    document.getElementById('addTaskModal').style.display = 'flex';
    setTimeout(() => document.getElementById('addTaskTitle').focus(), 100);
}

function closeAddTaskModal() {
    document.getElementById('addTaskModal').style.display = 'none';
}

async function submitAddTask() {
    const domain = document.getElementById('addTaskDomain').value;
    const title = document.getElementById('addTaskTitle').value.trim();
    const priority = document.getElementById('addTaskPriority').value;
    const due_date = document.getElementById('addTaskDueDate').value;
    const project = document.getElementById('addTaskProject').value.trim();
    const notes = document.getElementById('addTaskNotes').value.trim();

    if (!title) { showToast('❌ 請輸入標題', 'error'); return; }

    showToast('建立任務中...', 'info');
    try {
        const res = await fetch('/api/taskhub/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, title, priority, due_date: due_date || undefined, notes: notes || undefined, project: project || undefined }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast(`✅ 任務已建立`, 'success');
        closeAddTaskModal();
        fetchTasks();
        fetchTaskhubStats();
    } catch (e) {
        showToast(`❌ 建立失敗: ${e.message}`, 'error');
    }
}

// ─── End TaskHub Module ───────────────────────
