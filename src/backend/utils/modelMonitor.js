const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const MODEL_COOLDOWN_CACHE_TTL = 3000;
let modelCache = { ts: 0, cooldowns: {} };

// Parse the output of `openclaw models status`
async function fetchModelCooldowns() {
    const now = Date.now();
    /* istanbul ignore next */
    if (now - modelCache.ts < MODEL_COOLDOWN_CACHE_TTL && Object.keys(modelCache.cooldowns).length > 0) {
        return modelCache.cooldowns;
    }

    try {
        const { stdout } = await execPromise('/Users/openclaw/.openclaw/bin/openclaw models status');
        const lines = stdout.split('\n');
        const cooldowns = {};

        // In OpenClaw 2026.2.X, output looks like:
        // - openai-codex effective=... | openai-codex:default=OAuth [cooldown 31m]

        lines.forEach(line => {
            if (!line.includes('[cooldown')) return;

            const match = line.match(/-\s([\w-]+)\seffective=.*?\[cooldown\s([\d.]+[ms])\]/);
            if (match) {
                const provider = match[1];
                const cooldownStr = match[2];
                let cooldownSeconds = 0;

                if (cooldownStr.endsWith('m')) {
                    cooldownSeconds = parseFloat(cooldownStr) * 60;
                } else /* istanbul ignore next */ if (cooldownStr.endsWith('s')) {
                    cooldownSeconds = parseFloat(cooldownStr);
                }

                cooldowns[provider] = {
                    status: 'COOLDOWN',
                    cooldownSeconds: cooldownSeconds,
                    rawStr: cooldownStr
                };
            }
        });

        modelCache = { ts: now, cooldowns };
        return cooldowns;
    } catch (error) {
        console.error('[Model Monitor] Failed to fetch models status:', error);
        return /* istanbul ignore next */ modelCache.cooldowns || {}; // return last known state or empty
    }
}

module.exports = {
    fetchModelCooldowns
};
