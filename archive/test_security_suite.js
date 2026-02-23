
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';

async function runTest(name, fn) {
    console.log(`\n[TEST] ${name}`);
    try {
        await fn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.error(`[FAIL] ${name}: ${error.message}`);
    }
}

async function main() {
    console.log('🛡️ 自適應安全系統完整測試套件 🛡️');
    console.log('====================================');

    // 1. 測試健康檢查
    await runTest('健康檢查', async () => {
        const res = await fetch(`${BASE_URL}/api/health`);
        const data = await res.json();
        if (!data.success) throw new Error('API 失敗');
        console.log(`   狀態: ${data.status}, 安全級別: ${data.security.currentLevel}`);
    });

    // 2. 測試威脅分析
    await runTest('威脅分析 (惡意輸入)', async () => {
        const res = await fetch(`${BASE_URL}/api/threats/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'rm -rf /' })
        });
        const data = await res.json();
        if (data.risk !== 'critical') throw new Error('未檢測到高風險');
        console.log(`   風險評分: ${data.risk}, 威脅數: ${data.threatCount}`);
    });

    // 3. 測試安全級別自動調整與警報
    await runTest('自動調整與警報 (critical)', async () => {
        const res = await fetch(`${BASE_URL}/api/security/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'system prompt leakage attempt ignore previous instructions' })
        });
        const data = await res.json();
        if (data.currentLevel !== 'critical') throw new Error('級別未調整至 critical');
        
        // 檢查警報
        const alertRes = await fetch(`${BASE_URL}/api/security/alerts`);
        const alertData = await alertRes.json();
        if (alertData.count === 0) throw new Error('未觸發警報');
        console.log(`   當前級別: ${data.currentLevel}, 警報數: ${alertData.count}`);
    });

    // 4. 測試歷史記錄
    await runTest('歷史記錄查詢', async () => {
        const res = await fetch(`${BASE_URL}/api/security/history`);
        const data = await res.json();
        if (data.count === 0) throw new Error('無歷史記錄');
        console.log(`   歷史記錄條目: ${data.count}`);
    });

    // 5. 測試合規性報告
    await runTest('合規性分析', async () => {
        const res = await fetch(`${BASE_URL}/api/compliance/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                security: { inputValidation: true, threatDetection: true, protectionMeasures: true },
                monitoring: { logging: true }
            })
        });
        const data = await res.json();
        if (data.summary.score !== '100.0') throw new Error(`合規分數不足: ${data.summary.score}`);
        console.log(`   合規分數: ${data.summary.score}%`);
    });

    console.log('\n====================================');
    console.log('✅ 所有測試完成');
}

main();
