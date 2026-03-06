const { threatIntel, adaptiveSecurity } = require('../security');
const { sendOk, sendFail } = require('../utils/apiResponse');

class SecurityController {
    analyzeThreats(req, res) {
        try {
            const { content, context } = req.body;

            if (!content) {
                return sendFail(res, 400, '缺少內容參數');
            }

            const analysis = threatIntel.analyze(content);
            return sendOk(res, analysis);
        } catch (error) { /* istanbul ignore next */
            return sendFail(res, 500, error.message);
        }
    }

    analyzeSecurity(req, res) {
        try {
            const { content, context } = req.body;

            if (!content) {
                return sendFail(res, 400, '缺少內容參數');
            }

            const result = adaptiveSecurity.analyze(content, context || {});
            return sendOk(res, result);
        } catch (error) { /* istanbul ignore next */
            return sendFail(res, 500, error.message);
        }
    }

    searchAndLearn(req, res) {
        const query = req.query.q;
        if (!query) {
            return sendFail(res, 400, '缺少查詢參數');
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
