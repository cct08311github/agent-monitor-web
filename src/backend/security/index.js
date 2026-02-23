const ThreatIntelligence = require('./threat_intelligence_fixed');
const AdaptiveSecurity = require('./adaptive_security_simple');
const ComplianceSystem = require('./compliance_simple');

const threatIntel = new ThreatIntelligence();
const adaptiveSecurity = new AdaptiveSecurity(threatIntel);
const complianceSystem = new ComplianceSystem();

module.exports = {
    threatIntel,
    adaptiveSecurity,
    complianceSystem
};
