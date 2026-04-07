const { threatIntel, adaptiveSecurity } = require('../security');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

class SecurityController {
    analyzeThreats(req, res) {
        try {
            const { content, context } = req.body;

            if (!content) {
                return sendFail(res, 400, 'missing_content');
            }

            if (typeof content !== 'string' || content.length > 10_000) {
                return sendFail(res, 400, 'invalid_content');
            }

            const analysis = threatIntel.analyze(content);
            return sendOk(res, analysis);
        } catch (error) { /* istanbul ignore next */
            logger.error('security_analyze_threats_error', { details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    analyzeSecurity(req, res) {
        try {
            const { content, context } = req.body;

            if (!content) {
                return sendFail(res, 400, 'missing_content');
            }

            if (typeof content !== 'string' || content.length > 10_000) {
                return sendFail(res, 400, 'invalid_content');
            }

            const result = adaptiveSecurity.analyze(content, context || {});
            return sendOk(res, result);
        } catch (error) { /* istanbul ignore next */
            logger.error('security_analyze_security_error', { details: logger.toErrorFields(error) });
            return sendFail(res, 500, 'internal_error');
        }
    }

    searchAndLearn(req, res) {
        const query = req.query.q;
        if (!query) {
            return sendFail(res, 400, 'missing_query');
        }

        if (typeof query !== 'string' || query.length > 512) {
            return sendFail(res, 400, 'invalid_query');
        }

        const securityAnalysis = adaptiveSecurity.analyze(query, { source: 'learning_query' });

        if (securityAnalysis.riskScore > 0.7) {
            return sendOk(res, {
                query: query,
                securityWarning: true,
                securityAnalysis: securityAnalysis,
                results: [{
                    title: '安全警告 - 查詢風險過高',
                    content: '您的查詢被識別為高風險，已進行安全分析。',
                    securityLevel: 'warning'
                }]
            });
        }

        const results = {
            query: query,
            timestamp: new Date().toISOString(),
            securityLevel: adaptiveSecurity.currentLevel,
            results: [{
                title: '安全學習示範',
                content: '這是安全學習系統的示範結果。',
                securityLevel: 'verified'
            }]
        };

        return sendOk(res, results);
    }
}

module.exports = new SecurityController();
