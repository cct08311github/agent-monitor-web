const fs = require('fs');
const { getOpenClawConfig } = require('../config');
const openclawClient = require('../services/openclawClient');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

function getPaths() {
    const openclaw = getOpenClawConfig();
    return {
        notionSyncScript: openclaw.notionSyncScriptPath,
        openclawConfigPath: openclaw.configPath,
    };
}

const LOW_RISK_ALLOWLIST = new Set(['status', 'talk', 'notion_sync', 'switch-model', 'models', 'agents']);
const HIGH_RISK_ALLOWLIST = new Set(['restart', 'update']);

class ControlController {
    async runCommand(req, res) {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const command = typeof body.command === 'string' ? body.command.trim() : '';

        if (!command) {
            return sendFail(res, 400, 'bad_request', { message: 'Missing command.' });
        }

        if (!LOW_RISK_ALLOWLIST.has(command) && !HIGH_RISK_ALLOWLIST.has(command)) {
            return sendFail(res, 403, 'command_not_allowed');
        }

        try {
            if (command === 'talk') {
                /* istanbul ignore next */
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                /* istanbul ignore next */
                const message = typeof body.message === 'string' ? body.message : '';

                if (!agentId || !message || !/^[A-Za-z0-9_-]+$/.test(agentId)) {
                    return sendFail(res, 400, 'bad_request', { message: 'Invalid agent ID format.' });
                }
                if (message.length > 4096) {
                    return sendFail(res, 400, 'bad_request', { message: 'Message too long (max 4096 chars).' });
                }

                const { stdout, stderr } = await openclawClient.runArgs(['agent', '--agent', agentId, '--message', message, '--no-color']);
                return sendOk(res, { output: /* istanbul ignore next */ stdout || stderr });
            }

            if (command === 'switch-model') {
                /* istanbul ignore next */
                const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
                /* istanbul ignore next */
                const model = typeof body.model === 'string' ? body.model.trim() : '';

                if (!agentId || !model || !/^[A-Za-z0-9_-]+$/.test(agentId) || !/^[A-Za-z0-9._/-]+$/.test(model)) {
                    return sendFail(res, 400, 'bad_request', { message: 'Invalid format.' });
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
                        const tmpPath = openclawConfigPath + '.tmp.' + process.pid;
                        fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
                        fs.renameSync(tmpPath, openclawConfigPath);
                        return sendOk(res, { output: `Model switched for ${agentId} to ${model}` });
                    }
                    return sendFail(res, 404, 'not_found', { message: `Agent ${agentId} not found in config` });
                } catch (err) {
                    return sendFail(res, 500, 'config_error', { message: 'config_read_failed' });
                }
            }

            if (command === 'restart' || command === 'update') {
                const args = command === 'restart' ? ['gateway', 'restart'] : ['update'];
                sendOk(res, { output: `COMMAND_ACCEPTED: ${command.toUpperCase()} initiated.` });

                setTimeout(() => {
                    openclawClient.execArgs(args, /* istanbul ignore next */ (error) => {
                        /* istanbul ignore next */
                        if (error) {
                            logger.error('control_command_failed', {
                                requestId: req.requestId,
                                command,
                                details: logger.toErrorFields(error),
                            });
                        }
                    });
                }, 500);
                return;
            }

            /* istanbul ignore next */
            if (command === 'notion_sync') {
                const { notionSyncScript } = getPaths();
                const resolved = require('path').resolve(notionSyncScript);
                const allowedPrefix = require('path').resolve(getOpenClawConfig().root);
                if (!resolved.startsWith(allowedPrefix + '/')) {
                    return sendFail(res, 400, 'bad_request', { message: 'Invalid sync script path.' });
                }
                const { stdout, stderr } = await openclawClient.runArgs([resolved], { binPath: 'python3' });
                return sendOk(res, { output: /* istanbul ignore next */ stdout || stderr });
            }

            const directMap = {
                status: [],
                models: ['models', 'status'],
                agents: ['agents', 'list']
            };

            /* istanbul ignore next */
            if (directMap[command]) {
                const { stdout, stderr } = await openclawClient.runArgs(directMap[command]);
                return sendOk(res, { output: stdout || stderr });
            }
        /* istanbul ignore next */
        } catch (error) {
            logger.error('control_command_error', {
                requestId: req.requestId,
                command,
                details: logger.toErrorFields(error),
            });
            /* istanbul ignore next */
            return sendFail(res, 500, 'command_failed', { output: 'command execution failed' });
        }

        /* istanbul ignore next */
        return sendFail(res, 500, 'unhandled_command');
    }

    async runLegacyCommand(req, res) {
        return this.runCommand(req, res);
    }
}

module.exports = new ControlController();
