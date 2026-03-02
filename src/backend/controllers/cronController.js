const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const JOBS_FILE = '/Users/openclaw/.openclaw/cron/jobs.json';
const OPENCLAW_BIN = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');

class CronController {
    /**
     * 獲取所有 Cron 任務
     */
    async getJobs(req, res) {
        console.log('[CronController] Fetching jobs...');
        try {
            if (!fs.existsSync(JOBS_FILE)) {
                console.warn('[CronController] Jobs file not found at:', JOBS_FILE);
                return res.json({ success: true, jobs: [] });
            }
            const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            console.log(`[CronController] Found ${data.jobs?.length || 0} jobs.`);
            res.json({ success: true, jobs: data.jobs || [] });
        } catch (error) {
            console.error('獲取 Cron 任務失敗:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * 切換任務狀態 (啟用/停用)
     */
    async toggleJob(req, res) {
        const { id } = req.params;
        const { enabled } = req.body;

        try {
            if (!fs.existsSync(JOBS_FILE)) {
                throw new Error('任務文件不存在');
            }

            const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            const jobIndex = data.jobs.findIndex(j => j.id === id);

            if (jobIndex === -1) {
                return res.status(404).json({ success: false, error: '找不到該任務' });
            }

            // 更新狀態
            data.jobs[jobIndex].enabled = enabled;
            data.jobs[jobIndex].updatedAtMs = Date.now();

            // 寫回文件
            fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf8');

            res.json({ success: true, job: data.jobs[jobIndex] });
        } catch (error) {
            console.error('更新 Cron 任務失敗:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * 刪除指定 Cron 任務
     */
    async deleteJob(req, res) {
        const { id } = req.params;
        try {
            if (!fs.existsSync(JOBS_FILE)) {
                throw new Error('任務文件不存在');
            }
            const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            const before = data.jobs.length;
            data.jobs = data.jobs.filter(j => j.id !== id);
            if (data.jobs.length === before) {
                return res.status(404).json({ success: false, error: '找不到該任務' });
            }
            fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf8');
            console.log(`[CronController] Deleted job ${id}`);
            res.json({ success: true });
        } catch (error) {
            console.error('[CronController] Delete failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * 立即執行指定 Cron 任務
     */
    async runJob(req, res) {
        const { id } = req.params;
        console.log(`[CronController] Manual run requested for job id: ${id}`);

        try {
            // 驗證任務存在
            if (!fs.existsSync(JOBS_FILE)) {
                throw new Error('任務文件不存在');
            }
            const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            const job = data.jobs.find(j => j.id === id);
            if (!job) {
                return res.status(404).json({ success: false, error: '找不到該任務' });
            }

            console.log(`[CronController] Spawning: ${OPENCLAW_BIN} cron run ${id}`);

            const child = spawn(OPENCLAW_BIN, ['cron', 'run', id], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            res.json({
                success: true,
                message: '任務已觸發（在背景執行中）',
                jobId: id
            });
        } catch (error) {
            console.error('[CronController] Unexpected error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new CronController();
