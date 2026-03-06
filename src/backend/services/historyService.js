'use strict';

const tsdbService = require('./tsdbService');
const { ok } = require('../utils/apiResponse');

function getHistoryPayload() {
    const history = tsdbService.getSystemHistory(60);
    const topSpenders = tsdbService.getAgentTopTokens(5);
    const costHistory = tsdbService.getCostHistory(60);
    const agentActivity = tsdbService.getAgentActivitySummary();

    return ok({ history, topSpenders, costHistory, agentActivity });
}

module.exports = {
    getHistoryPayload,
};
