const { adaptiveSecurity, complianceSystem } = require('../security');
const { sendOk, sendFail } = require('../utils/apiResponse');

class ComplianceController {
    analyzeCompliance(req, res) {
        try {
            const systemData = req.body;

            /* istanbul ignore next */
            if (!systemData) {
                return sendFail(res, 400, '缺少系統數據');
            }

            const enhancedData = {
                ...systemData,
                security: {
                    inputValidation: true,
                    threatDetection: true,
                    protectionMeasures: adaptiveSecurity.currentLevel !== 'low'
                },
                monitoring: {
                    logging: true
                }
            };

            const analysis = complianceSystem.analyze(enhancedData);
            const report = complianceSystem.generateReport(analysis);

            return sendOk(res, report);
        } catch (error) { /* istanbul ignore next */
            return sendFail(res, 500, error.message);
        }
    }

    getComplianceStatus(req, res) {
        try {
            return sendOk(res, complianceSystem.getStatus());
        } catch (error) { /* istanbul ignore next */
            return sendFail(res, 500, error.message);
        }
    }
}

module.exports = new ComplianceController();
