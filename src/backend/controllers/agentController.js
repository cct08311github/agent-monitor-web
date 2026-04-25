const openclawService = require('../services/openclawService');
const tsdbService = require('../services/tsdbService');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const AGENT_ID_RE = /^[A-Za-z0-9_-]+$/;

class AgentController {
    async getAgents(req, res) {
        try {
            const agentsText = await openclawService.getOpenClawData('openclaw agents list', false);
            const agentsList = openclawService.parseAgentsList(agentsText || '');

            const agents = [];

            for (const agent of agentsList) {
                const realActivity = openclawService.detectRealActivity(agent.id, agent.workspace);

                agents.push({
                    id: agent.id,
                    name: agent.name || agent.id,
                    status: realActivity.status,
                    emoji: realActivity.emoji,
                    label: realActivity.label,
                    lastActivity: realActivity.minutesAgo < 9999 ? `${realActivity.minutesAgo}分鐘前` : '從未活動',
                    model: agent.model || '未知',
                    workspace: agent.workspace || '未知'
                });
            }

            const stats = {
                total: agents.length,
                executing: agents.filter(a => a.status === 'active_executing').length,
                recent: agents.filter(a => a.status === 'active_recent').length,
                historical: agents.filter(a => a.status === 'active_historical').length,
                dormant: agents.filter(a => a.status === 'dormant').length,
                inactive: agents.filter(a => a.status === 'inactive').length,
                error: agents.filter(a => a.status === 'error').length
            };

            return sendOk(res, {
                timestamp: new Date().toISOString(),
                stats: stats,
                agents: agents
            });

        } catch (error) { /* istanbul ignore next */
            logger.error('agent_get_agents_error', { requestId: req.requestId, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getHistory(req, res) {
        try {
            const agentId = req.params.id;
            if (!agentId || !AGENT_ID_RE.test(agentId)) {
                return sendFail(res, 400, 'invalid_agent_id');
            }

            const rawHours = req.query.hours !== undefined ? req.query.hours : '24';
            const hours = parseInt(rawHours, 10);
            if (isNaN(hours) || hours < 1 || hours > 168) {
                return sendFail(res, 400, 'invalid_hours');
            }

            const history = tsdbService.getAgentHistory(agentId, hours);
            return sendOk(res, { history });
        } catch (error) { /* istanbul ignore next */
            logger.error('agent_get_history_error', { requestId: req.requestId, details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }
}

module.exports = new AgentController();
