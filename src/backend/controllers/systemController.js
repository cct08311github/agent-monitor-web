const { threatIntel, adaptiveSecurity, complianceSystem } = require('../security');
const openclawService = require('../services/openclawService');
const { sendOk, sendFail } = require('../utils/apiResponse');

class SystemController {
    async getComprehensiveStatus(req, res) {
        try {
            const threatStatus = threatIntel.getStatus();
            const securityStatus = adaptiveSecurity.getStatus();
            const complianceStatus = complianceSystem.getStatus();

            const agentsText = await openclawService.getOpenClawData('openclaw agents list', false);
            const agentsList = openclawService.parseAgentsList(/* istanbul ignore next */ agentsText || '');

            const systemData = {
                name: 'Agent 監控系統',
                version: '2.5.1',
                components: {
                    monitoring: { status: 'operational' },
                    security: { status: 'operational' },
                    compliance: { status: 'operational' }
                }
            };

            const complianceAnalysis = complianceSystem.analyze(systemData);

            return sendOk(res, {
                timestamp: new Date().toISOString(),
                system: {
                    name: 'Agent 監控與安全系統',
                    version: '2.5.1',
                    status: 'operational'
                },
                components: {
                    monitoring: {
                        status: 'operational',
                        agents: agentsList.length,
                        activeAgents: agentsList.filter(a => openclawService.detectRealActivity(a.id, a.workspace).status !== 'inactive').length
                    },
                    security: {
                        status: 'operational',
                        currentLevel: securityStatus.currentLevel,
                        levelInfo: securityStatus.levelInfo,
                        threatRules: threatStatus.rules
                    },
                    compliance: {
                        status: 'operational',
                        score: complianceAnalysis.score,
                        level: complianceAnalysis.level,
                        standards: complianceStatus.standards
                    }
                },
                summary: {
                    securityLevel: securityStatus.levelInfo.emoji + ' ' + securityStatus.levelInfo.label,
                    complianceScore: complianceAnalysis.score + '%',
                    activeAgents: agentsList.filter(a => openclawService.detectRealActivity(a.id, a.workspace).status !== 'inactive').length,
                    totalAgents: agentsList.length
                },
                recommendations: [
                    '定期更新威脅情報規則',
                    '監控自適應安全級別變化',
                    '定期進行合規檢查'
                ]
            });

        } catch (error) { /* istanbul ignore next */
            return sendFail(res, 500, error.message);
        }
    }

    getHealth(req, res) {
        const threatStatus = threatIntel.getStatus();
        const securityStatus = adaptiveSecurity.getStatus();
        const complianceStatus = complianceSystem.getStatus();

        return sendOk(res, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.5.1',
            features: [
                '真實活動檢測',
                '智能狀態分類',
                '威脅情報集成',
                '自適應安全系統',
                '合規報告系統',
                '安全學習管道'
            ],
            security: {
                currentLevel: securityStatus.currentLevel,
                levelInfo: securityStatus.levelInfo,
                threatRules: threatStatus.rules
            },
            compliance: {
                standards: complianceStatus.standards,
                totalChecks: complianceStatus.totalChecks,
                lastScore: complianceStatus.lastScore
            }
        });
    }
}

module.exports = new SystemController();
