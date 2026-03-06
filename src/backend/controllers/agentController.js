const openclawService = require('../services/openclawService');
const { sendOk, sendFail } = require('../utils/apiResponse');

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
            return sendFail(res, 500, error.message);
        }
    }
}

module.exports = new AgentController();
