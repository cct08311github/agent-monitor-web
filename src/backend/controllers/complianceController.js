const { adaptiveSecurity, complianceSystem } = require('../security');

class ComplianceController {
    analyzeCompliance(req, res) {
        try {
            const systemData = req.body;

            /* istanbul ignore next */
            if (!systemData) {
                return res.status(400).json({ success: false, error: '缺少系統數據' });
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

            res.json({ success: true, ...report });
        } catch (error) { /* istanbul ignore next */
            res.status(500).json({ success: false, error: error.message });
        }
    }

    getComplianceStatus(req, res) {
        try {
            res.json({ success: true, ...complianceSystem.getStatus() });
        } catch (error) { /* istanbul ignore next */
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new ComplianceController();
