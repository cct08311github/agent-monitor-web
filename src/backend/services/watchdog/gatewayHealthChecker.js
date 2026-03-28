'use strict';

const util = require('util');
const { execFile } = require('child_process');
const http = require('http');

const execFilePromise = util.promisify(execFile);

function createHealthChecker({ GATEWAY_HOST, GATEWAY_PORT, OPENCLAW_PATH, CONFIG }) {
    async function checkGatewayHealth() {
        return new Promise((resolve) => {
            /* istanbul ignore next */
            const timeout = setTimeout(() => {
                resolve({ healthy: false, reason: 'timeout', detail: `Gateway 無回應 (${CONFIG.healthCheckTimeoutMs}ms 超時)` });
            }, CONFIG.healthCheckTimeoutMs);

            const req = http.request({
                hostname: GATEWAY_HOST,
                port: GATEWAY_PORT,
                path: '/healthz',
                method: 'GET',
                timeout: CONFIG.healthCheckTimeoutMs,
            }, (res) => {
                clearTimeout(timeout);
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        resolve({ healthy: true, statusCode: res.statusCode, body });
                    } else {
                        resolve({ healthy: false, reason: 'http_error', statusCode: res.statusCode, detail: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
                    }
                });
            });

            req.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ healthy: false, reason: 'connection_error', detail: `連線失敗: ${err.message}` });
            });

            req.on('timeout', () => {
                clearTimeout(timeout);
                req.destroy();
                resolve({ healthy: false, reason: 'timeout', detail: 'Gateway 連線超時' });
            });

            req.end();
        });
    }

    async function checkOpenClawStatus() {
        try {
            const { stdout, stderr } = await execFilePromise(OPENCLAW_PATH, ['status'], { timeout: 15_000 });
            const output = (stdout.toString() + stderr.toString()).toLowerCase();

            /* istanbul ignore next */
            if (output.includes('config invalid') || output.includes('syntaxerror')) {
                return { healthy: false, error: 'config_invalid', detail: 'OpenClaw 設定檔格式錯誤 (JSON Invalid)' };
            }

            const isRunning = output.includes('running') || output.includes('online') || output.includes('gateway');
            return { healthy: isRunning, output: stdout.toString().slice(0, 500) };
        } catch (e) {
            const output = e.stderr?.toString().toLowerCase() || e.stdout?.toString().toLowerCase() || '';
            /* istanbul ignore next */
            if (output.includes('config invalid') || output.includes('syntaxerror')) {
                return { healthy: false, error: 'config_invalid', detail: 'OpenClaw 設定檔格式錯誤 (JSON Invalid)' };
            }
            return { healthy: false, error: 'command_error', detail: e.message };
        }
    }

    return { checkGatewayHealth, checkOpenClawStatus };
}

module.exports = { createHealthChecker };
