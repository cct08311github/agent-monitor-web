const path = require('path');
const fs = require('fs');
const { getOpenClawConfig } = require('../config');
const openclawClient = require('../services/openclawClient');

// --- Constants ---
function getPaths() {
    const openclaw = getOpenClawConfig();
    return {
        notionSyncScript: openclaw.notionSyncScriptPath,
        openclawConfigPath: openclaw.configPath,
    };
}

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
                /* istanbul ignore next */
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                /* istanbul ignore next */
                const message = typeof body.message === 'string' ? body.message : '';

                if (!agentId || !message || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
                    return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid agent ID format.' });
                }

                const { stdout, stderr } = await openclawClient.runArgs(['agent', '--agent', agentId, '--message', message, '--no-color']);
                return res.json({ success: true, output: /* istanbul ignore next */ stdout || stderr });
            }

            // Case 2: Model Switch
            if (command === 'switch-model') {
                /* istanbul ignore next */
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                /* istanbul ignore next */
                const model = typeof body.model === 'string' ? body.model.trim() : '';

                if (!agentId || !model || !/^[A-Za-z0-9_-]+$/.test(agentId) || !/^[A-Za-z0-9._/-]+$/.test(model)) {
                    return res.status(400).json({ success: false, error: 'bad_request', message: 'Invalid format.' });
                }

                try {
                    const { openclawConfigPath } = getPaths();
                    const configData = fs.readFileSync(openclawConfigPath, 'utf8');
                    const config = JSON.parse(configData);
                    let found = false;
                    for (const a of config.agents.list) {
                        if (a.id === agentId) {
                            a.model.primary = model;
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        fs.writeFileSync(openclawConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
                        return res.json({ success: true, output: `Model switched for ${agentId} to ${model}` });
                    } else {
                        return res.status(404).json({ success: false, error: 'not_found', message: `Agent ${agentId} not found in config` });
                    }
                } catch (err) {
                    return res.status(500).json({ success: false, error: 'config_error', message: err.message });
                }
            }

            // Case 3: System Operations (Restart/Update)
            if (command === 'restart' || command === 'update') {
                const args = command === 'restart' ? ['gateway', 'restart'] : ['update'];
                res.json({ success: true, output: `COMMAND_ACCEPTED: ${command.toUpperCase()} initiated.` });

                setTimeout(() => {
                    openclawClient.execArgs(args, /* istanbul ignore next */ (error) => {
                        /* istanbul ignore next */
                        if (error) console.error(`[Control] ${command} failed:`, error.message);
                    });
                }, 500);
                return;
            }

            // Case 4: Notion Sync
            /* istanbul ignore next */
            if (command === 'notion_sync') {
                const { notionSyncScript } = getPaths();
                const { stdout, stderr } = await openclawClient.runArgs([notionSyncScript], { binPath: 'python3' });
                return res.json({ success: true, output: /* istanbul ignore next */ stdout || stderr });
            }

            // Case 5: Direct Status Commands
            const directMap = {
                'status': [],
                'models': ['models', 'status'],
                'agents': ['agents', 'list']
            };

            /* istanbul ignore next */
            if (directMap[command]) {
                const { stdout, stderr } = await openclawClient.runArgs(directMap[command]);
                /* istanbul ignore next */
                return res.json({ success: true, output: stdout || stderr });
            }

        /* istanbul ignore next */
        } catch (error) {
            /* istanbul ignore next */
            console.error(`[Control] Error executing ${command}:`, error.message);
            /* istanbul ignore next */
            return res.status(500).json({ success: false, output: error.stdout || error.stderr || error.message });
        }

        /* istanbul ignore next */
        return res.status(500).json({ success: false, error: 'unhandled_command' });
    }

    async runLegacyCommand(req, res) {
        return this.runCommand(req, res);
    }
}

module.exports = new LegacyControlController();
