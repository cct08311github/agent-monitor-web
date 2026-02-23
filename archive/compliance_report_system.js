      // 保存到文件
      const reportsDir = path.join(__dirname, 'compliance_reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      const reportFile = path.join(reportsDir, `report_${analysis.analyzedAt.replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(analysis, null, 2), 'utf8');
      
      this.logger.info(`合規報告已保存: ${reportFile}`);
      
    } catch (error) {
      this.logger.error(`保存合規報告失敗: ${error.message}`);
    }
  }
  
  getSystemStatus() {
    /** 獲取系統狀態 */
    return {
      status: 'operational',
      standards: Object.keys(COMPLIANCE_STANDARDS),
      totalChecks: Object.values(COMPLIANCE_CHECKS).reduce((sum, checks) => sum + checks.length, 0),
      reportHistory: this.reportHistory.length,
      lastReport: this.reportHistory.length > 0 ? this.reportHistory[this.reportHistory.length - 1].timestamp : null
    };
  }
  
  getTrendAnalysis(days = 30) {
    /** 獲取趨勢分析 */
    try {
      const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      const recentReports = this.reportHistory.filter(r => new Date(r.timestamp) > cutoff);
      
      if (recentReports.length === 0) {
        return { message: '無近期報告數據' };
      }
      
      const trend = {
        period: `${days}天`,
        totalReports: recentReports.length,
        scores: recentReports.map(r => parseFloat(r.overallScore)),
        averageScore: 0,
        trend: 'stable',
        improvements: 0,
        regressions: 0
      };
      
      // 計算平均分數
      trend.averageScore = trend.scores.reduce((sum, score) => sum + score, 0) / trend.scores.length;
      
      // 分析趨勢
      if (trend.scores.length >= 2) {
        const firstScore = trend.scores[0];
        const lastScore = trend.scores[trend.scores.length - 1];
        
        if (lastScore > firstScore + 5) {
          trend.trend = 'improving';
        } else if (lastScore < firstScore - 5) {
          trend.trend = 'declining';
        }
        
        // 計算改進和退步次數
        for (let i = 1; i < trend.scores.length; i++) {
          if (trend.scores[i] > trend.scores[i - 1] + 2) {
            trend.improvements++;
          } else if (trend.scores[i] < trend.scores[i - 1] - 2) {
            trend.regressions++;
          }
        }
      }
      
      return trend;
      
    } catch (error) {
      this.logger.error(`獲取趨勢分析失敗: ${error.message}`);
      return { error: error.message };
    }
  }
}

// 測試函數
async function testComplianceSystem() {
  console.log('🧪 測試合規報告系統');
  console.log('='.repeat(50));
  
  const complianceSystem = new ComplianceReportSystem();
  
  // 模擬系統數據
  const mockSystemData = {
    name: 'Agent 監控系統',
    version: '2.4.0',
    components: {
      monitoring: { status: 'operational' },
      security: { status: 'operational' }
    },
    security: {
      inputValidation: true,
      logging: true,
      configuration: false,
      threatDetection: true,
      protectionMeasures: true,
      incidentResponse: false,
      persistenceProtection: true,
      defenseEvasionDetection: false,
      initialAccessProtection: true
    },
    monitoring: {
      logging: true
    }
  };
  
  // 測試 1: 系統合規分析
  console.log('\n1. 測試系統合規分析');
  const analysis = complianceSystem.analyzeSystem(mockSystemData);
  console.log(`   總體分數: ${analysis.overallScore}%`);
  console.log(`   合規級別: ${analysis.complianceLevel}`);
  
  // 測試 2: 生成合規報告
  console.log('\n2. 測試生成合規報告');
  const report = complianceSystem.generateComplianceReport(analysis);
  console.log(`   報告 ID: ${report.reportId}`);
  console.log(`   檢查項目: ${report.executiveSummary.totalChecks} 個`);
  console.log(`   通過項目: ${report.executiveSummary.passedChecks} 個`);
  
  // 測試 3: 生成 OWASP 標準報告
  console.log('\n3. 測試 OWASP 標準報告');
  const owaspReport = complianceSystem.generateStandardReport('OWASP', analysis);
  console.log(`   OWASP 分數: ${owaspReport.overallScore}%`);
  console.log(`   類別數量: ${owaspReport.categories.length}`);
  
  // 測試 4: 系統狀態
  console.log('\n4. 測試系統狀態');
  const status = complianceSystem.getSystemStatus();
  console.log(`   支援標準: ${status.standards.join(', ')}`);
  console.log(`   總檢查數: ${status.totalChecks}`);
  
  // 測試 5: 趨勢分析
  console.log('\n5. 測試趨勢分析');
  const trend = complianceSystem.getTrendAnalysis(7);
  console.log(`   趨勢: ${trend.trend}`);
  console.log(`   平均分數: ${trend.averageScore?.toFixed(1) || 'N/A'}%`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 合規報告系統測試完成');
}

// API 端點（可整合到 server.js）
function setupComplianceAPI(app) {
  const complianceSystem = new ComplianceReportSystem();
  
  // 合規分析端點
  app.post('/api/compliance/analyze', async (req, res) => {
    try {
      const systemData = req.body;
      
      if (!systemData) {
        return res.status(400).json({
          success: false,
          error: '缺少系統數據'
        });
      }
      
      const analysis = complianceSystem.analyzeSystem(systemData);
      
      res.json({
        success: true,
        ...analysis
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 生成合規報告端點
  app.post('/api/compliance/report', async (req, res) => {
    try {
      const { systemData, format } = req.body;
      
      if (!systemData) {
        return res.status(400).json({
          success: false,
          error: '缺少系統數據'
        });
      }
      
      const analysis = complianceSystem.analyzeSystem(systemData);
      const report = complianceSystem.generateComplianceReport(analysis, format || 'detailed');
      
      res.json({
        success: true,
        ...report
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 獲取標準報告端點
  app.get('/api/compliance/standard/:standard', (req, res) => {
    try {
      const { standard } = req.params;
      const systemData = req.body || {};
      
      if (!COMPLIANCE_STANDARDS[standard]) {
        return res.status(400).json({
          success: false,
          error: '不支援的合規標準',
          supportedStandards: Object.keys(COMPLIANCE_STANDARDS)
        });
      }
      
      const analysis = complianceSystem.analyzeSystem(systemData);
      const report = complianceSystem.generateStandardReport(standard, analysis);
      
      res.json({
        success: true,
        ...report
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 獲取系統狀態端點
  app.get('/api/compliance/status', (req, res) => {
    try {
      res.json({
        success: true,
        ...complianceSystem.getSystemStatus()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 獲取趨勢分析端點
  app.get('/api/compliance/trend', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const trend = complianceSystem.getTrendAnalysis(days);
      
      res.json({
        success: true,
        ...trend
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  console.log('📋 合規報告 API 已設置');
}

// 主函數（獨立運行時）
if (require.main === module) {
  console.log('📋 合規報告系統');
  console.log('版本: 1.0.0');
  console.log('支援標準: OWASP, NIST, MITRE');
  console.log('='.repeat(50));
  
  // 運行測試
  testComplianceSystem().catch(console.error);
}

module.exports = {
  ComplianceReportSystem,
  setupComplianceAPI,
  COMPLIANCE_STANDARDS,
  COMPLIANCE_CHECKS
};