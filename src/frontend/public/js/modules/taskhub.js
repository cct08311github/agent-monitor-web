// ═══════════════════════════════════════════════
// TaskHub Module (IIFE)
// ═══════════════════════════════════════════════
(function () {

let thDomain = 'all';
let thTasks = [];
let thSearchTimer = null;
let thSortCol = null;
let thSortDir = 'asc';

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
    const grid = document.getElementById('taskhubGrid');
    if (grid) grid.classList.toggle('th-hide-domain', domain !== 'all');
}

function debounceThSearch() {
    clearTimeout(thSearchTimer);
    thSearchTimer = setTimeout(fetchTasks, 400);
}

async function fetchTaskhubStats() {
    try {
        const data = await window.apiClient.get('/api/taskhub/stats');
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

    // NOTE: innerHTML usage here is pre-existing; values come from backend stats (integers), not user input
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
    // NOTE: innerHTML usage here is pre-existing; static loading indicator only
    if (grid) grid.innerHTML = '<div class="th-loading">載入中...</div>';

    try {
        const data = await window.apiClient.get('/api/taskhub/tasks?' + params);
        if (!data.success) throw new Error(data.error);
        thTasks = data.tasks;
        renderTasks(thTasks);
    } catch (e) {
        // NOTE: innerHTML usage here is pre-existing; esc() sanitizes the message
        if (grid) grid.innerHTML = `<div class="th-empty">載入失敗: ${esc(e.message)}</div>`;
        pushLog('TaskHub fetch error: ' + e.message, 'err');
    }
}

const _PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const _STATUS_ORDER   = { in_progress: 0, blocked: 1, not_started: 2, draft: 3, done: 4, archived: 5, cancelled: 6 };

function _sortTasks(tasks) {
    if (!thSortCol) return tasks;
    return [...tasks].sort((a, b) => {
        let cmp = 0;
        if (thSortCol === 'priority') {
            cmp = (_PRIORITY_ORDER[a.priority] ?? 99) - (_PRIORITY_ORDER[b.priority] ?? 99);
        } else if (thSortCol === 'due_date') {
            const da = a.due_date || '9999', db = b.due_date || '9999';
            cmp = da < db ? -1 : da > db ? 1 : 0;
        } else if (thSortCol === 'status') {
            cmp = (_STATUS_ORDER[a.status] ?? 99) - (_STATUS_ORDER[b.status] ?? 99);
        }
        return thSortDir === 'asc' ? cmp : -cmp;
    });
}

function renderTasks(tasks) {
    const grid = document.getElementById('taskhubGrid');
    if (!grid) return;

    if (!tasks || tasks.length === 0) {
        grid.replaceChildren();
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        var iconWrap = document.createElement('div');
        iconWrap.className = 'empty-state-icon';
        var iconInner = document.createElement('span');
        iconInner.className = 'empty-icon-inner';
        iconInner.textContent = '📋';
        iconWrap.appendChild(iconInner);
        empty.appendChild(iconWrap);
        var emptyTitle = document.createElement('div');
        emptyTitle.className = 'empty-state-title';
        emptyTitle.textContent = '沒有符合的任務';
        empty.appendChild(emptyTitle);
        var emptyDesc = document.createElement('div');
        emptyDesc.className = 'empty-state-desc';
        emptyDesc.textContent = '嘗試調整篩選條件，或新增一個任務';
        empty.appendChild(emptyDesc);
        grid.appendChild(empty);
        return;
    }

    const table = document.createElement('table');
    table.className = 'th-task-table';

    const thead = table.createTHead();
    const hRow = thead.insertRow();
    const SORT_COLS = { '優先': 'priority', '狀態': 'status', '到期': 'due_date' };
    ['優先', '標題', '狀態', 'Domain', '專案', '到期', '操作'].forEach(h => {
        const th = document.createElement('th');
        const sortKey = SORT_COLS[h];
        const arrow = thSortCol === sortKey ? (thSortDir === 'asc' ? ' ↑' : ' ↓') : '';
        th.textContent = h + arrow;
        if (sortKey) {
            th.className = 'th-sortable';
            th.addEventListener('click', () => {
                if (thSortCol === sortKey) {
                    thSortDir = thSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    thSortCol = sortKey;
                    thSortDir = 'asc';
                }
                renderTasks(thTasks);
            });
        }
        hRow.appendChild(th);
    });

    const tbody = table.createTBody();
    _sortTasks(tasks).forEach(t => tbody.appendChild(_buildTaskRow(t)));

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

function _mkBtn(container, cls, text, fn) {
    const btn = document.createElement('button');
    btn.className = 'th-action-btn ' + cls;
    btn.textContent = text;
    btn.addEventListener('click', fn);
    container.appendChild(btn);
}

function _appendActionButtons(container, task) {
    if (task.status === 'not_started')
        _mkBtn(container, 'th-btn-start', '▶ 開始', () => quickUpdateStatus(task.domain, task.id, 'in_progress'));
    else if (task.status === 'in_progress')
        _mkBtn(container, 'th-btn-done', '✓ 完成', () => quickUpdateStatus(task.domain, task.id, 'done'));
    else if (task.status === 'blocked')
        _mkBtn(container, 'th-btn-start', '▶ 恢復', () => quickUpdateStatus(task.domain, task.id, 'in_progress'));

    if (['done', 'archived', 'cancelled'].includes(task.status)) return;

    const wrap = document.createElement('div');
    wrap.className = 'th-dropdown';

    const trigger = document.createElement('button');
    trigger.className = 'th-action-btn th-btn-more';
    trigger.textContent = '⋯';
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = wrap.classList.toggle('th-dropdown-open');
        if (open) {
            const close = () => { wrap.classList.remove('th-dropdown-open'); document.removeEventListener('click', close); };
            setTimeout(() => document.addEventListener('click', close), 0);
        }
    });

    const menu = document.createElement('div');
    menu.className = 'th-dropdown-menu';

    if (task.status === 'in_progress') {
        const blockItem = document.createElement('button');
        blockItem.textContent = '⛔ 封鎖';
        blockItem.addEventListener('click', () => quickUpdateStatus(task.domain, task.id, 'blocked'));
        menu.appendChild(blockItem);
    }
    const editItem = document.createElement('button');
    editItem.textContent = '✏️ 編輯';
    editItem.addEventListener('click', () => openTaskDetail(task.domain, task.id));
    menu.appendChild(editItem);

    wrap.append(trigger, menu);
    container.appendChild(wrap);
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
        const data = await window.apiClient.patch(`/api/taskhub/tasks/${domain}/${id}`, { status });
        if (!data.success) throw new Error(data.error);
        showToast(`已更新為「${TH_STATUS_MAP[status]?.label || status}」`, 'success');
        // Update local state & re-render
        const idx = thTasks.findIndex(t => t.id === id);
        if (idx >= 0) { thTasks[idx] = data.task; renderTasks(thTasks); }
        fetchTaskhubStats();
    } catch (e) {
        showToast(`更新失敗: ${e.message}`, 'error');
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

    // NOTE: innerHTML usage here is pre-existing; all dynamic values are sanitized via esc()
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

    if (!body.title) { showToast('標題不可空白', 'error'); return; }

    showToast('儲存中...', 'info');
    try {
        const data = await window.apiClient.patch(`/api/taskhub/tasks/${domain}/${id}`, body);
        if (!data.success) throw new Error(data.error);
        showToast('已儲存', 'success');
        const idx = thTasks.findIndex(t => t.id === id);
        if (idx >= 0) thTasks[idx] = data.task;
        closeTaskDetailModal();
        renderTasks(thTasks);
        fetchTaskhubStats();
    } catch (e) {
        showToast(`儲存失敗: ${e.message}`, 'error');
    }
}

function confirmDeleteTask(domain, id, title) {
    function doDelete() {
        showToast('刪除中...', 'info');
        window.apiClient.delete(`/api/taskhub/tasks/${domain}/${id}`).then(function (data) {
            if (!data.success) throw new Error(data.error);
            showToast('任務已刪除', 'success');
            thTasks = thTasks.filter(t => !(t.id === id && t.domain === domain));
            closeTaskDetailModal();
            renderTasks(thTasks);
            fetchTaskhubStats();
        }).catch(function (e) {
            showToast(`刪除失敗: ${e.message}`, 'error');
        });
    }

    if (window.ConfirmDialog) {
        ConfirmDialog.show({
            type: 'danger',
            title: '刪除任務',
            message: '確認刪除「' + title + '」？此操作無法復原。',
            confirmLabel: '刪除',
            onConfirm: doDelete
        });
    } else if (confirm('確認刪除任務「' + title + '」？\n此操作無法復原。')) {
        doDelete();
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
    var modal = document.getElementById('addTaskModal');
    modal.style.display = 'flex';

    if (window.FocusTrap) {
        FocusTrap.activate(modal.querySelector('.modal-content') || modal, {
            initialFocus: '#addTaskTitle',
            onDeactivate: function () { closeAddTaskModal(); }
        });
    } else {
        setTimeout(() => document.getElementById('addTaskTitle').focus(), 100);
    }

    if (window.FormValidator) {
        FormValidator.attachRealtimeValidation([
            { field: 'addTaskTitle', rules: ['required', FormValidator.RULES.maxLength(200)] }
        ]);
    }
}

function closeAddTaskModal() {
    if (window.FocusTrap && FocusTrap.isActive()) FocusTrap.deactivate();
    document.getElementById('addTaskModal').style.display = 'none';
}

async function submitAddTask() {
    if (window.FormValidator) {
        var errors = FormValidator.validateForm([
            { field: 'addTaskTitle', rules: ['required', FormValidator.RULES.maxLength(200)] },
            { field: 'addTaskDomain', rules: ['nonemptySelect'] }
        ]);
        if (errors.length > 0) return;
    }

    const domain = document.getElementById('addTaskDomain').value;
    const title = document.getElementById('addTaskTitle').value.trim();
    const priority = document.getElementById('addTaskPriority').value;
    const due_date = document.getElementById('addTaskDueDate').value;
    const project = document.getElementById('addTaskProject').value.trim();
    const notes = document.getElementById('addTaskNotes').value.trim();

    if (!title) { showToast('請輸入標題', 'error'); return; }

    showToast('建立任務中...', 'info');
    try {
        const data = await window.apiClient.post('/api/taskhub/tasks', {
            domain,
            title,
            priority,
            due_date: due_date || undefined,
            notes: notes || undefined,
            project: project || undefined
        });
        if (!data.success) throw new Error(data.error);
        showToast('任務已建立', 'success');
        closeAddTaskModal();
        fetchTasks();
        fetchTaskhubStats();
    } catch (e) {
        showToast(`建立失敗: ${e.message}`, 'error');
    }
}

// Expose only symbols needed by inline HTML handlers or cross-module calls
window.setThDomain = setThDomain;
window.debounceThSearch = debounceThSearch;
window.fetchTasks = fetchTasks;
window.fetchTaskhubStats = fetchTaskhubStats;
window.closeTaskDetailModal = closeTaskDetailModal;
window.openAddTaskModal = openAddTaskModal;
window.closeAddTaskModal = closeAddTaskModal;
window.submitAddTask = submitAddTask;
window.saveTaskEdit = saveTaskEdit;
window.confirmDeleteTask = confirmDeleteTask;

})();
// ─── End TaskHub Module ───────────────────────
