#!/usr/bin/env node

/**
 * 歷史趨勢記錄系統
 * 定期記錄 Agent 活動狀態，用於趨勢分析
 */

const fs = require('fs');
const path = require('path');

// 歷史數據存儲目錄
const HISTORY_DIR = path.join(__dirname, 'history');
const DAILY_FILE = path.join(HISTORY_DIR, 'daily_stats.json');
const HOURLY_FILE = path.join(HISTORY_DIR, 'hourly_stats.json');

// 確保目錄存在
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// 獲取當前時間戳
function getCurrentTimestamp() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    date: now.toISOString().split('T')[0], // YYYY-MM-DD
    hour: now.getHours(),
    minute: now.getMinutes(),
    timestamp: now.getTime()
  };
}

// 記錄每日統計
function recordDailyStats(stats) {
  try {
    const timestamp = getCurrentTimestamp();
    
    // 讀取現有數據
    let dailyData = [];
    if (fs.existsSync(DAILY_FILE)) {
      const content = fs.readFileSync(DAILY_FILE, 'utf8');
      dailyData = JSON.parse(content);
    }
    
    // 添加新記錄
    const record = {
      timestamp: timestamp.iso,
      date: timestamp.date,
      hour: timestamp.hour,
      stats: stats
    };
    
    dailyData.push(record);
    
    // 只保留最近7天的數據
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    dailyData = dailyData.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();
      return recordTime > sevenDaysAgo;
    });
    
    // 保存數據
    fs.writeFileSync(DAILY_FILE, JSON.stringify(dailyData, null, 2));
    
    console.log(`📅 每日統計記錄完成: ${timestamp.iso}`);
    return true;
    
  } catch (error) {
    console.error('記錄每日統計失敗:', error.message);
    return false;
  }
}

// 記錄每小時統計
function recordHourlyStats(stats) {
  try {
    const timestamp = getCurrentTimestamp();
    
    // 讀取現有數據
    let hourlyData = [];
    if (fs.existsSync(HOURLY_FILE)) {
      const content = fs.readFileSync(HOURLY_FILE, 'utf8');
      hourlyData = JSON.parse(content);
    }
    
    // 添加新記錄
    const record = {
      timestamp: timestamp.iso,
      date: timestamp.date,
      hour: timestamp.hour,
      minute: timestamp.minute,
      stats: stats
    };
    
    hourlyData.push(record);
    
    // 只保留最近24小時的數據
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    hourlyData = hourlyData.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();
      return recordTime > twentyFourHoursAgo;
    });
    
    // 保存數據
    fs.writeFileSync(HOURLY_FILE, JSON.stringify(hourlyData, null, 2));
    
    console.log(`⏰ 每小時統計記錄完成: ${timestamp.hour}:${timestamp.minute}`);
    return true;
    
  } catch (error) {
    console.error('記錄每小時統計失敗:', error.message);
    return false;
  }
}

// 生成趨勢報告
function generateTrendReport(days = 7) {
  try {
    if (!fs.existsSync(DAILY_FILE)) {
      return { error: '無歷史數據' };
    }
    
    const content = fs.readFileSync(DAILY_FILE, 'utf8');
    const dailyData = JSON.parse(content);
    
    // 過濾指定天數內的數據
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentData = dailyData.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();
      return recordTime > cutoffTime;
    });
    
    if (recentData.length === 0) {
      return { error: '無近期數據' };
    }
    
    // 計算趨勢
    const trends = {
      dates: [],
      effectiveActive: [],
      totalTokens: [],
      systemStatus: []
    };
    
    // 按日期分組
    const dailyGroups = {};
    recentData.forEach(record => {
      const date = record.date;
      if (!dailyGroups[date]) {
        dailyGroups[date] = [];
      }
      dailyGroups[date].push(record);
    });
    
    // 計算每日平均值
    Object.entries(dailyGroups).forEach(([date, records]) => {
      const avgEffectiveActive = Math.round(
        records.reduce((sum, r) => sum + r.stats.effectiveActive, 0) / records.length
      );
      
      const avgTotalTokens = Math.round(
        records.reduce((sum, r) => sum + r.stats.totalTokens, 0) / records.length
      );
      
      // 計算系統狀態（取最常見的狀態）
      const statusCounts = {};
      records.forEach(r => {
        const status = r.stats.systemStatus;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      
      const mostCommonStatus = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
      
      trends.dates.push(date);
      trends.effectiveActive.push(avgEffectiveActive);
      trends.totalTokens.push(avgTotalTokens);
      trends.systemStatus.push(mostCommonStatus);
    });
    
    // 計算變化趨勢
    const firstDay = trends.effectiveActive[0];
    const lastDay = trends.effectiveActive[trends.effectiveActive.length - 1];
    const activeChange = lastDay - firstDay;
    const activeChangePercent = firstDay > 0 ? ((activeChange / firstDay) * 100).toFixed(1) : 0;
    
    const firstTokens = trends.totalTokens[0];
    const lastTokens = trends.totalTokens[trends.totalTokens.length - 1];
    const tokensChange = lastTokens - firstTokens;
    const tokensChangePercent = firstTokens > 0 ? ((tokensChange / firstTokens) * 100).toFixed(1) : 0;
    
    // 生成報告
    const report = {
      period: `${days}天`,
      startDate: trends.dates[0],
      endDate: trends.dates[trends.dates.length - 1],
      dataPoints: recentData.length,
      trends: trends,
      summary: {
        effectiveActive: {
          current: lastDay,
          change: activeChange,
          changePercent: activeChangePercent,
          trend: activeChange > 0 ? '上升' : activeChange < 0 ? '下降' : '持平'
        },
        totalTokens: {
          current: lastTokens,
          change: tokensChange,
          changePercent: tokensChangePercent,
          trend: tokensChange > 0 ? '上升' : tokensChange < 0 ? '下降' : '持平'
        },
        systemHealth: {
          currentStatus: trends.systemStatus[trends.systemStatus.length - 1],
          normalDays: trends.systemStatus.filter(s => s === 'normal').length,
          warningDays: trends.systemStatus.filter(s => s === 'warning').length,
          errorDays: trends.systemStatus.filter(s => s === 'error').length
        }
      },
      recommendations: []
    };
    
    // 生成建議
    if (activeChange < 0 && Math.abs(activeChangePercent) > 10) {
      report.recommendations.push({
        type: 'warning',
        message: `有效活動 Agent 數量下降 ${Math.abs(activeChangePercent)}%，建議檢查系統配置`
      });
    }
    
    if (tokensChangePercent > 20) {
      report.recommendations.push({
        type: 'warning',
        message: `Token 使用量增長 ${tokensChangePercent}%，建議優化任務效率`
      });
    }
    
    if (report.summary.systemHealth.errorDays > 0) {
      report.recommendations.push({
        type: 'error',
        message: `系統有 ${report.summary.systemHealth.errorDays} 天處於異常狀態，建議立即檢查`
      });
    }
    
    if (report.summary.systemHealth.normalDays === days) {
      report.recommendations.push({
        type: 'success',
        message: '系統在觀察期內保持正常狀態，表現良好'
      });
    }
    
    console.log(`📈 趨勢報告生成完成: ${days}天數據`);
    return report;
    
  } catch (error) {
    console.error('生成趨勢報告失敗:', error.message);
    return { error: error.message };
  }
}

// API 端點（可整合到 server.js）
function setupHistoryAPI(app) {
  // 獲取歷史數據
  app.get('/api/history/daily', (req, res) => {
    try {
      if (!fs.existsSync(DAILY_FILE)) {
        return res.json({ success: true, data: [], message: '無歷史數據' });
      }
      
      const content = fs.readFileSync(DAILY_FILE, 'utf8');
      const data = JSON.parse(content);
      
      res.json({
        success: true,
        data: data,
        count: data.length
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 獲取趨勢報告
  app.get('/api/history/trends', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7;
      const report = generateTrendReport(days);
      
      if (report.error) {
        return res.json({
          success: true,
          message: report.error,
          data: null
        });
      }
      
      res.json({
        success: true,
        report: report
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 手動記錄當前狀態
  app.post('/api/history/record', async (req, res) => {
    try {
      // 需要從主 API 獲取當前狀態
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // 模擬獲取當前狀態（實際應調用 /api/agents）
      const { stdout } = await execPromise('curl -s http://localhost:3000/api/agents');
      const currentData = JSON.parse(stdout);
      
      if (currentData.success) {
        const dailyResult = recordDailyStats(currentData.stats);
        const hourlyResult = recordHourlyStats(currentData.stats);
        
        res.json({
          success: true,
          dailyRecorded: dailyResult,
          hourlyRecorded: hourlyResult,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error('無法獲取當前狀態');
      }
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  console.log('📊 歷史趨勢 API 已設置');
}

// 主函數（獨立運行時）
if (require.main === module) {
  console.log('📈 歷史趨勢記錄系統');
  console.log('==========================\n');
  
  // 測試功能
  const testStats = {
    total: 21,
    executing: 0,
    recent: 1,
    historical: 15,
    dormant: 4,
    inactive: 1,
    error: 0,
    effectiveActive: 1,
    configured: 21,
    totalTokens: 52673,
    systemStatus: 'warning'
  };
  
  // 記錄測試數據
  recordDailyStats(testStats);
  recordHourlyStats(testStats);
  
  // 生成測試報告
  const report = generateTrendReport(1);
  console.log('\n📋 測試報告:');
  console.log(JSON.stringify(report, null, 2));
  
  console.log('\n✅ 系統測試完成');
}

module.exports = {
  recordDailyStats,
  recordHourlyStats,
  generateTrendReport,
  setupHistoryAPI,
  HISTORY_DIR,
  DAILY_FILE,
  HOURLY_FILE
};