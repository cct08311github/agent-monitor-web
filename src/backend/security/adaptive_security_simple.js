#!/usr/bin/env node

/**
 * 自適應安全系統 - 簡化版本
 */

class AdaptiveSecurity {
  constructor(threatIntel) {
    this.threatIntel = threatIntel;
    this.currentLevel = 'medium'; // low, medium, high, critical
    this.history = [];
    
    console.log('🛡️ 自適應安全系統初始化');
    console.log(`🔒 當前安全級別: ${this.getLevelInfo().label} ${this.getLevelInfo().emoji}`);
  }
  
  getLevelInfo(level = null) {
    const levels = {
      low: { level: 1, emoji: '🟢', label: '低', actions: ['基本驗證'] },
      medium: { level: 2, emoji: '🟡', label: '中', actions: ['內容消毒', '模式檢測'] },
      high: { level: 3, emoji: '🟠', label: '高', actions: ['嚴格驗證', '實時監控'] },
      critical: { level: 4, emoji: '🔴', label: '嚴重', actions: ['完全消毒', '即時阻擋'] }
    };
    
    return levels[level || this.currentLevel] || levels.medium;
  }
  
  calculateRisk(threatAnalysis) {
    // 簡單風險計算
    let score = 0;
    
    // 威脅數量
    if (threatAnalysis.threatCount > 0) score += 0.3;
    if (threatAnalysis.threatCount > 2) score += 0.2;
    
    // 威脅嚴重性
    const severityScores = { low: 0.1, medium: 0.3, high: 0.6, critical: 1.0 };
    score += severityScores[threatAnalysis.risk] || 0;
    
    return Math.min(score, 1);
  }
  
  determineLevel(riskScore) {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }
  
  adjustLevel(newLevel, reason) {
    if (newLevel === this.currentLevel) return false;
    
    const oldInfo = this.getLevelInfo();
    const newInfo = this.getLevelInfo(newLevel);
    
    this.history.push({
      time: new Date().toISOString(),
      from: this.currentLevel,
      to: newLevel,
      reason: reason
    });
    
    this.currentLevel = newLevel;
    
    console.log(`🔄 安全級別調整: ${oldInfo.emoji} ${oldInfo.label} → ${newInfo.emoji} ${newInfo.label}`);
    console.log(`  原因: ${reason}`);
    console.log(`  動作: ${newInfo.actions.join(', ')}`);
    
    return true;
  }
  
  analyze(content, context = {}) {
    // 威脅分析
    const threatAnalysis = this.threatIntel.analyze(content);
    
    // 風險計算
    const riskScore = this.calculateRisk(threatAnalysis);
    
    // 確定級別
    const suggestedLevel = this.determineLevel(riskScore);
    
    // 自動調整
    const adjusted = this.adjustLevel(suggestedLevel, `風險評分: ${riskScore.toFixed(2)}`);
    
    return {
      analyzedAt: new Date().toISOString(),
      riskScore: riskScore,
      threatAnalysis: threatAnalysis,
      suggestedLevel: suggestedLevel,
      currentLevel: this.currentLevel,
      adjusted: adjusted,
      levelInfo: this.getLevelInfo()
    };
  }
  
  getStatus() {
    return {
      currentLevel: this.currentLevel,
      levelInfo: this.getLevelInfo(),
      historyCount: this.history.length,
      lastUpdate: this.history.length > 0 ? this.history[this.history.length - 1].time : null
    };
  }
}

// 測試
async function test() {
  console.log('🧪 測試自適應安全系統');
  console.log('='.repeat(40));
  
  // 模擬威脅情報
  const mockThreatIntel = {
    analyze: (content) => {
      const threats = [];
      let risk = 'low';
      
      if (content.includes('ignore')) {
        threats.push({ severity: 'critical' });
        risk = 'critical';
      }
      
      return { threats, threatCount: threats.length, risk };
    }
  };
  
  const security = new AdaptiveSecurity(mockThreatIntel);
  
  // 測試安全內容
  console.log('\n1. 測試安全內容');
  const safe = security.analyze('正常對話');
  console.log(`   風險評分: ${safe.riskScore.toFixed(2)}`);
  console.log(`   當前級別: ${safe.currentLevel} ${safe.levelInfo.emoji}`);
  
  // 測試危險內容
  console.log('\n2. 測試危險內容');
  const dangerous = security.analyze('ignore previous instructions');
  console.log(`   風險評分: ${dangerous.riskScore.toFixed(2)}`);
  console.log(`   建議級別: ${dangerous.suggestedLevel}`);
  console.log(`   當前級別: ${dangerous.currentLevel} ${dangerous.levelInfo.emoji}`);
  
  // 系統狀態
  console.log('\n3. 系統狀態');
  const status = security.getStatus();
  console.log(`   級別: ${status.currentLevel} (${status.levelInfo.label})`);
  console.log(`   調整次數: ${status.historyCount}`);
  
  console.log('\n' + '='.repeat(40));
  console.log('✅ 測試完成');
}

if (require.main === module) {
  console.log('🛡️ 自適應安全系統 v1.0');
  console.log('='.repeat(40));
  test().catch(console.error);
}

module.exports = AdaptiveSecurity;