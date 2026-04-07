const { adaptiveSecurity, complianceSystem } = require('../security');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

class ComplianceController {
    analyzeCompliance(req, res) {
        if (!req.body || typeof req.body !== 'object') {
            return sendFail(res, 400, 'missing_body');
        }
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
            logger.error('compliance_analyze_error', { details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    getComplianceStatus(req, res) {
        try {
            return sendOk(res, complianceSystem.getStatus());
        } catch (error) { /* istanbul ignore next */
            logger.error('compliance_get_status_error', { details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }
}

module.exports = new ComplianceController();
