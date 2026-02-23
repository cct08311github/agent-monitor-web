const fs = require('fs');
const path = require('path');

const JOBS_FILE = '/Users/openclaw/.openclaw/cron/jobs.json';

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
}

module.exports = new CronController();
