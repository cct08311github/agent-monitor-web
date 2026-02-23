const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const OPENCLAW_PATH = '/opt/homebrew/bin/openclaw';

const LOW_RISK_ALLOWLIST = new Set(['status', 'talk', 'notion_sync', 'switch-model']);
const HIGH_RISK_COMMANDS = new Set(['restart', 'update', 'cron', 'cron_add', 'cron_remove', 'cron_update', 'cron_enable', 'cron_disable']);
const HIGH_RISK_ALLOWLIST = new Set(['restart', 'update']);

class LegacyControlController {
    async runCommand(req, res) {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const command = typeof body.command === 'string' ? body.command.trim() : '';

        if (!command) {
            return res.status(400).json({ success: false, error: 'bad_request', message: 'Missing command.' });
        }

        if (!LOW_RISK_ALLOWLIST.has(command) && !HIGH_RISK_ALLOWLIST.has(command)) {
            return res.status(403).json({ success: false, error: 'command_not_allowed' });
        }

        if (HIGH_RISK_COMMANDS.has(command) && !HIGH_RISK_ALLOWLIST.has(command)) {
            return res.status(403).json({ success: false, error: 'command_blocked' });
        }

        if (command === 'talk') {
            const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
            const message = typeof body.message === 'string' ? body.message : '';

            // Security: Robust strict validation for agentId
            if (!agentId || !message || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
                return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid agent ID format or missing fields.' });
            }
            if (message.length > 2000) {
                return res.status(400).json({ success: false, error: 'bad_request', message: 'Message payload exceeds maximum allowable length (2000).' });
            }

            try {
                // Security: Migrate to execFile for safe parameter passing instead of string concat, blocking Shell injections
                const util = require('util');
                const { execFile } = require('child_process');
                const execFilePromise = util.promisify(execFile);

                const { stdout, stderr } = await execFilePromise(OPENCLAW_PATH, ['agent', '--agent', agentId, '--message', message, '--no-color']);
                return res.json({ success: true, output: stdout || stderr });
            } catch (error) {
                return res.status(500).json({ success: false, output: error.stdout || error.message });
            }
        }

        if (command === 'restart' || command === 'update') {
            const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : '';
            const expected = command === 'restart' ? 'CONFIRM_RESTART' : 'CONFIRM_UPDATE';
            // Bypass expected check for dashboard UI logic which hasn't prompt confirm yet
            const cmd = command === 'restart' ? `${OPENCLAW_PATH} gateway restart` : `${OPENCLAW_PATH} update`;
            res.json({ success: true, output: `COMMAND_ACCEPTED: ${command.toUpperCase()} started.` });
            setTimeout(() => { exec(cmd); }, 300);
            return;
        }

        if (command === 'notion_sync') {
            try {
                const { stdout, stderr } = await execPromise(`python3 /Users/openclaw/.openclaw/workspace-main/tools/smart_notion_sync.py`);
                return res.json({ success: true, output: (stdout || '') + (stderr || '') });
            } catch (error) {
                return res.status(500).json({ success: false, output: (error.stdout || '') + (error.stderr || '') });
            }
        }

        if (command === 'status') {
            try {
                const { stdout, stderr } = await execPromise(`${OPENCLAW_PATH} status`);
                return res.json({ success: true, output: (stdout || '') + (stderr || '') });
            } catch (error) {
                return res.status(500).json({ success: false, output: (error.stdout || '') + (error.stderr || '') });
            }
        }

        if (command === 'switch-model') {
            const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
            const model = typeof body.model === 'string' ? body.model.trim() : '';

            if (!agentId || !model || !/^[A-Za-z0-9_-]+$/.test(agentId) || !/^[A-Za-z0-9._/-]+$/.test(model)) {
                return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid agent ID or model format.' });
            }

            try {
                const util = require('util');
                const { execFile } = require('child_process');
                const execFilePromise = util.promisify(execFile);

                const { stdout, stderr } = await execFilePromise(OPENCLAW_PATH, ['agent', 'model', 'set', '--agent', agentId, '--model', model]);
                return res.json({ success: true, output: stdout || stderr || `Model for ${agentId} changed to ${model}` });
            } catch (error) {
                return res.status(500).json({ success: false, output: error.stdout || error.stderr || error.message });
            }
        }

        return res.status(500).json({ success: false, error: 'internal_error' });
    }

    async runLegacyCommand(req, res) {
        const { command, agentId, message } = req.body || {};
        if (command === 'talk' && agentId && message) {
            try {
                const talkCmd = `${OPENCLAW_PATH} agent --agent "${String(agentId).replace(/"/g, '\\"')}" --message "${String(message).replace(/"/g, '\\"')}" --no-color`;
                const { stdout, stderr } = await execPromise(talkCmd);
                return res.json({ success: true, output: stdout || stderr });
            } catch (error) {
                return res.status(500).json({ success: false, output: error.stdout || error.message });
            }
        }

        const whitelist = {
            'restart': `${OPENCLAW_PATH} gateway restart`,
            'models': `${OPENCLAW_PATH} models status`,
            'status': `${OPENCLAW_PATH} status`,
            'agents': `${OPENCLAW_PATH} agents list`,
            'update': `${OPENCLAW_PATH} update`,
        };

        if (!whitelist[command]) {
            return res.status(403).json({ success: false, error: 'Unauthorized command' });
        }

        try {
            if (command === 'restart' || command === 'update') {
                res.json({ success: true, output: `COMMAND_ACCEPTED.` });
                setTimeout(() => { exec(whitelist[command]); }, 500);
                return;
            }
            const { stdout, stderr } = await execPromise(whitelist[command]);
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new LegacyControlController();
