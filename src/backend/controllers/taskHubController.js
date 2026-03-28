/**
 * TaskHub Controller
 * Thin controller: validates request params, delegates to repository, formats response.
 */

const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const repo = require('../repositories/taskHubRepository');

function tryParseJson(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

function withParsedTags(task) {
    return { ...task, tags: tryParseJson(task.tags, []) };
}

async function getStats(req, res) {
    try {
        const stats = repo.getStatsByDomain();
        return sendOk(res, { stats });
    } catch (err) {
        logger.error('taskhub_stats_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

async function getTasks(req, res) {
    try {
        const { domain = 'all' } = req.query;
        if (domain !== 'all' && !repo.isValidDomain(domain)) {
            return sendFail(res, 400, `Invalid domain: ${domain}`);
        }

        const tasks = repo.findTasks(req.query);
        return sendOk(res, { tasks: tasks.map(withParsedTags), total: tasks.length });
    } catch (err) {
        logger.error('taskhub_get_tasks_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

async function updateTask(req, res) {
    const { domain, id } = req.params;
    if (!repo.isValidDomain(domain)) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }

    try {
        const { status, priority } = req.body;
        if (status && !repo.VALID_STATUSES.includes(status)) {
            return sendFail(res, 400, `Invalid status: ${status}`);
        }
        if (priority && !repo.VALID_PRIORITIES.includes(priority)) {
            return sendFail(res, 400, `Invalid priority: ${priority}`);
        }

        const result = repo.updateTask(domain, id, req.body);
        if (result.noFields) return sendFail(res, 400, 'No fields to update');
        if (result.notFound) return sendFail(res, 404, '找不到任務');

        return sendOk(res, { task: withParsedTags(result.task) });
    } catch (err) {
        logger.error('taskhub_update_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

async function deleteTask(req, res) {
    const { domain, id } = req.params;
    if (!repo.isValidDomain(domain)) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }
    try {
        const deleted = repo.deleteTask(domain, id);
        if (!deleted) return sendFail(res, 404, '找不到任務');

        logger.info('taskhub_task_deleted', { requestId: req.requestId, id, title: deleted.title, domain });
        return sendOk(res, { deleted });
    } catch (err) {
        logger.error('taskhub_delete_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

async function createTask(req, res) {
    const { domain, title } = req.body;

    if (!repo.isValidDomain(domain)) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }
    if (!title || !title.trim()) {
        return sendFail(res, 400, '標題不可空白');
    }

    try {
        const created = repo.insertTask(domain, req.body);
        return sendOk(res, { task: withParsedTags(created) }, 201);
    } catch (err) {
        logger.error('taskhub_create_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

module.exports = { getStats, getTasks, updateTask, createTask, deleteTask };
