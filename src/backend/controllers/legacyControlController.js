const os = require('os');
const path = require('path');
const util = require('util');
const { execFile } = require('child_process');
const execFilePromise = util.promisify(execFile);

// --- Constants ---
const HOME_DIR = os.homedir();
const OPENCLAW_ROOT = path.join(HOME_DIR, '.openclaw');
const OPENCLAW_BIN = path.join(OPENCLAW_ROOT, 'bin', 'openclaw');
const NOTION_SYNC_SCRIPT = path.join(OPENCLAW_ROOT, 'workspace-main', 'tools', 'smart_notion_sync.py');

const LOW_RISK_ALLOWLIST = new Set(['status', 'talk', 'notion_sync', 'switch-model', 'models', 'agents']);
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

        try {
            // Case 1: Talk to Agent
            if (command === 'talk') {
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                const message = typeof body.message === 'string' ? body.message : '';

                if (!agentId || !message || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
                    return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid agent ID format.' });
                }
                
                const { stdout, stderr } = await execFilePromise(OPENCLAW_BIN, ['agent', '--agent', agentId, '--message', message, '--no-color']);
                return res.json({ success: true, output: stdout || stderr });
            }

            // Case 2: Model Switch
            if (command === 'switch-model') {
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                const model = typeof body.model === 'string' ? body.model.trim() : '';

                if (!agentId || !model || !/^[A-Za-z0-9_-]+$/.test(agentId) || !/^[A-Za-z0-9._/-]+$/.test(model)) {
                    return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid format.' });
                }

                const { stdout, stderr } = await execFilePromise(OPENCLAW_BIN, ['agent', 'model', 'set', '--agent', agentId, '--model', model]);
                return res.json({ success: true, output: stdout || stderr });
            }

            // Case 3: System Operations (Restart/Update)
            if (command === 'restart' || command === 'update') {
                const args = command === 'restart' ? ['gateway', 'restart'] : ['update'];
                res.json({ success: true, output: `COMMAND_ACCEPTED: ${command.toUpperCase()} initiated.` });
                
                setTimeout(() => {
                    execFile(OPENCLAW_BIN, args, (error) => {
                        if (error) console.error(`[Control] ${command} failed:`, error.message);
                    });
                }, 500);
                return;
            }

            // Case 4: Notion Sync
            if (command === 'notion_sync') {
                const { stdout, stderr } = await execFilePromise('python3', [NOTION_SYNC_SCRIPT]);
                return res.json({ success: true, output: stdout || stderr });
            }

            // Case 5: Direct Status Commands
            const directMap = {
                'status': [],
                'models': ['models', 'status'],
                'agents': ['agents', 'list']
            };

            if (directMap[command]) {
                const { stdout, stderr } = await execFilePromise(OPENCLAW_BIN, directMap[command]);
                return res.json({ success: true, output: stdout || stderr });
            }

        } catch (error) {
            console.error(`[Control] Error executing ${command}:`, error.message);
            return res.status(500).json({ success: false, output: error.stdout || error.stderr || error.message });
        }

        return res.status(500).json({ success: false, error: 'unhandled_command' });
    }

    async runLegacyCommand(req, res) {
        return this.runCommand(req, res);
    }
}

module.exports = new LegacyControlController();
