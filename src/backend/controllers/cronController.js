const fs = require('fs');
const { getOpenClawConfig } = require('../config');
const openclawClient = require('../services/openclawClient');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

function getPaths() {
    const openclaw = getOpenClawConfig();
    return {
        jobsFile: openclaw.cronJobsPath,
    };
}

/**
 * Validate job ID format - alphanumeric with hyphens/underscores only
 * Prevents path traversal and injection attacks
 */
const JOB_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateJobId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > 128) return false; // Reasonable length limit
    return JOB_ID_REGEX.test(id);
}

class CronController {
    /**
     * 獲取所有 Cron 任務
     */
    async getJobs(req, res) {
        logger.info('cron_jobs_fetch_start', { requestId: req.requestId });
        try {
            const { jobsFile } = getPaths();
            if (!fs.existsSync(jobsFile)) {
                logger.warn('cron_jobs_file_missing', { requestId: req.requestId, jobsFile });
                return sendOk(res, { jobs: [] });
            }
            const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
            logger.info('cron_jobs_fetch_done', { requestId: req.requestId, count: data.jobs?.length || 0 });
            return sendOk(res, { jobs: data.jobs || [] });
        } catch (error) {
            logger.error('cron_jobs_fetch_error', { requestId: req.requestId, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    /**
     * 切換任務狀態 (啟用/停用)
     */
    async toggleJob(req, res) {
        const { id } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return sendFail(res, 400, 'invalid_enabled');
        }

        if (!validateJobId(id)) {
            logger.warn('cron_job_invalid_id', { requestId: req.requestId, id });
            return sendFail(res, 400, 'Invalid job ID format');
        }

        try {
            const { jobsFile } = getPaths();
            if (!fs.existsSync(jobsFile)) {
                throw new Error('任務文件不存在');
            }

            const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
            const jobIndex = data.jobs.findIndex(j => j.id === id);

            if (jobIndex === -1) {
                return sendFail(res, 404, '找不到該任務');
            }

            // 更新狀態
            data.jobs[jobIndex].enabled = enabled;
            data.jobs[jobIndex].updatedAtMs = Date.now();

            // 寫回文件
            fs.writeFileSync(jobsFile, JSON.stringify(data, null, 2), 'utf8');

            return sendOk(res, { job: data.jobs[jobIndex] });
        } catch (error) {
            logger.error('cron_job_toggle_error', { requestId: req.requestId, id, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    /**
     * 刪除指定 Cron 任務
     */
    async deleteJob(req, res) {
        const { id } = req.params;

        if (!validateJobId(id)) {
            logger.warn('cron_job_invalid_id', { requestId: req.requestId, id });
            return sendFail(res, 400, 'Invalid job ID format');
        }

        try {
            const { jobsFile } = getPaths();
            if (!fs.existsSync(jobsFile)) {
                throw new Error('任務文件不存在');
            }
            const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
            const before = data.jobs.length;
            data.jobs = data.jobs.filter(j => j.id !== id);
            if (data.jobs.length === before) {
                return sendFail(res, 404, '找不到該任務');
            }
            fs.writeFileSync(jobsFile, JSON.stringify(data, null, 2), 'utf8');
            logger.info('cron_job_deleted', { requestId: req.requestId, id });
            return sendOk(res);
        } catch (error) {
            logger.error('cron_job_delete_error', { requestId: req.requestId, id, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    /**
     * 立即執行指定 Cron 任務
     */
    async runJob(req, res) {
        const { id } = req.params;

        if (!validateJobId(id)) {
            logger.warn('cron_job_invalid_id', { requestId: req.requestId, id });
            return sendFail(res, 400, 'Invalid job ID format');
        }

        logger.info('cron_job_run_requested', { requestId: req.requestId, id });

        try {
            // 驗證任務存在
            const { jobsFile } = getPaths();
            if (!fs.existsSync(jobsFile)) {
                throw new Error('任務文件不存在');
            }
            const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
            const job = data.jobs.find(j => j.id === id);
            if (!job) {
                return sendFail(res, 404, '找不到該任務');
            }

            logger.info('cron_job_spawn', { requestId: req.requestId, id, binPath: openclawClient.getBinaryPath() });

            const child = openclawClient.spawnArgs(['cron', 'run', id], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            return sendOk(res, {
                message: '任務已觸發（在背景執行中）',
                jobId: id
            });
        } catch (error) {
            logger.error('cron_job_run_error', { requestId: req.requestId, id, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }
}

module.exports = new CronController();
module.exports.validateJobId = validateJobId;
