#!/usr/bin/env node

/**
 * 合規報告系統 - 簡化版本
 */

const logger = require('../utils/logger');

class ComplianceSystem {
  constructor() {
    this.standards = {
      OWASP: {
        name: 'OWASP Top 10',
        checks: [
          { id: 'A03', name: '注入攻擊防護', check: (sys) => sys.security?.inputValidation },
          { id: 'A09', name: '安全日誌記錄', check: (sys) => sys.monitoring?.logging }
        ]
      },
      NIST: {
        name: 'NIST CSF',
        checks: [
          { id: 'DE', name: '威脅檢測', check: (sys) => sys.security?.threatDetection },
          { id: 'PR', name: '防護措施', check: (sys) => sys.security?.protectionMeasures }
        ]
      }
    };
    
    this.history = [];
    logger.info('security_compliance_init', { standards: Object.keys(this.standards) });
  }
  
  analyze(system) {
    const results = {};
    let total = 0;
    let passed = 0;
    
    for (const [std, data] of Object.entries(this.standards)) {
      results[std] = [];
      
      for (const check of data.checks) {
        total++;
        const passedCheck = check.check(system) || false;
        if (passedCheck) passed++;
        
        results[std].push({
          id: check.id,
          name: check.name,
          passed: passedCheck,
          details: passedCheck ? '合規' : '不合規'
        });
      }
    }
    
    /* istanbul ignore next */
    const score = total > 0 ? (passed / total) * 100 : 0;
    const level = this.getLevel(score);
    
    const analysis = {
      time: new Date().toISOString(),
      score: score.toFixed(1),
      level: level,
      total: total,
      passed: passed,
      results: results
    };
    
    this.history.push(analysis);
    if (this.history.length > 200) this.history.shift();
    logger.info('security_compliance_analyzed', { score: score.toFixed(1), level });
    
    return analysis;
  }
  
  getLevel(score) {
    if (score >= 90) return '優秀';
    if (score >= 75) return '良好';
    if (score >= 60) return '基本合規';
    return '需要改進';
  }
  
  generateReport(analysis) {
    const report = {
      id: `COMP-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      generated: analysis.time,
      summary: {
        score: analysis.score,
        level: analysis.level,
        checks: analysis.total,
        passed: analysis.passed
      },
      standards: {},
      recommendations: []
    };
    
    for (const [std, checks] of Object.entries(analysis.results)) {
      const passed = checks.filter(c => c.passed).length;
      const total = checks.length;
      /* istanbul ignore next */
      const score = total > 0 ? (passed / total) * 100 : 0;
      
      report.standards[std] = {
        name: this.standards[std].name,
        score: score.toFixed(1),
        passed: passed,
        total: total,
        checks: checks
      };
      
      // 添加建議
      if (score < 60) {
        report.recommendations.push({
          standard: std,
          priority: '高',
          action: `改進 ${this.standards[std].name} 合規性`
        });
      }
    }
    
    return report;
  }
  
  getStatus() {
    return {
      standards: Object.keys(this.standards),
      totalChecks: Object.values(this.standards).reduce((sum, s) => sum + s.checks.length, 0),
      history: this.history.length,
      lastScore: this.history.length > 0 ? this.history[this.history.length - 1].score : null
    };
  }
}

/* istanbul ignore next */
// 測試
async function test() {
  console.log('🧪 測試合規報告系統');
  console.log('='.repeat(40));
  
  const compliance = new ComplianceSystem();
  
  // 模擬系統
  const mockSystem = {
    name: '監控系統',
    version: '2.4.0',
    security: {
      inputValidation: true,
      threatDetection: true,
      protectionMeasures: false
    },
    monitoring: {
      logging: true
    }
  };
  
  // 分析
  console.log('\n1. 合規分析');
  const analysis = compliance.analyze(mockSystem);
  console.log(`   分數: ${analysis.score}%`);
  console.log(`   級別: ${analysis.level}`);
  console.log(`   檢查: ${analysis.passed}/${analysis.total} 通過`);
  
  // 報告
  console.log('\n2. 生成報告');
  const report = compliance.generateReport(analysis);
  console.log(`   報告 ID: ${report.id}`);
  console.log(`   建議數: ${report.recommendations.length}`);
  
  // 狀態
  console.log('\n3. 系統狀態');
  const status = compliance.getStatus();
  console.log(`   標準: ${status.standards.join(', ')}`);
  console.log(`   檢查數: ${status.totalChecks}`);
  console.log(`   歷史記錄: ${status.history}`);
  
  console.log('\n' + '='.repeat(40));
  console.log('✅ 測試完成');
}

/* istanbul ignore next */
if (require.main === module) {
  console.log('📋 合規報告系統 v1.0');
  console.log('='.repeat(40));
  test().catch(console.error);
}

module.exports = ComplianceSystem;