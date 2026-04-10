'use strict';

const os = require('os');
const util = require('util');
const { execFile } = require('child_process');

const execFilePromise = util.promisify(execFile);

let previousCpuInfo = null;

async function getSystemResources() {
    try {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) total += cpu.times[type];
            idle += cpu.times.idle;
        }

        let cpuUsage = 0;
        if (previousCpuInfo && previousCpuInfo.total !== total) {
            const idleDiff = idle - previousCpuInfo.idle;
            const totalDiff = total - previousCpuInfo.total;
            cpuUsage = Math.max(0, Math.min(100, 100 - (100 * idleDiff / totalDiff)));
        } else {
            const load = os.loadavg();
            cpuUsage = Math.min(100, (load[0] / cpus.length * 100));
        }
        previousCpuInfo = { idle, total };

        const totalMem = os.totalmem();
        let freeMem = os.freemem();

        // Run platform-specific memory enrichment and disk check in parallel
        const [memResult, diskResult] = await Promise.all([
            (async () => {
                if (os.platform() === 'darwin') {
                    try {
                        const { stdout } = await execFilePromise('vm_stat');
                        const psMatch = stdout.match(/page size of (\d+) bytes/);
                        const pageSize = psMatch ? parseInt(psMatch[1], 10) : 4096;
                        const getVal = (key) => {
                            const match = stdout.match(new RegExp(`${key}:\\s+(\\d+)`));
                            return match ? parseInt(match[1], 10) * pageSize : 0;
                        };
                        const active = getVal('Pages active');
                        const wired = getVal('Pages wired down');
                        const occupied = getVal('Pages occupied by compressor');
                        const usedMem = active + wired + occupied;
                        if (usedMem > 0) return Math.max(0, totalMem - usedMem);
                    } catch (e) { /* vm_stat optional */ }
                } else if (os.platform() === 'linux') {
                    try {
                        const { stdout } = await execFilePromise('free', ['-b']);
                        const memMatch = stdout.match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
                        if (memMatch) return parseInt(memMatch[1], 10);
                    } catch (e) { /* free optional */ }
                }
                return null;
            })(),
            (async () => {
                try {
                    const { stdout } = await execFilePromise('df', ['-h', '/']);
                    const lastLine = stdout.trim().split('\n').pop();
                    const match = lastLine.match(/(\d+)%/);
                    if (match) return match[1];
                } catch (e) { /* df optional */ }
                return '0';
            })(),
        ]);

        if (memResult !== null) freeMem = memResult;
        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
        const diskUsage = diskResult;

        const uptimeSeconds = os.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        return {
            cpu: parseFloat(cpuUsage.toFixed(1)),
            memory: parseFloat(memUsage),
            memoryUsedGB: ((totalMem - freeMem) / (1024 ** 3)).toFixed(2),
            memoryTotalGB: (totalMem / (1024 ** 3)).toFixed(0),
            disk: parseFloat(diskUsage),
            uptime: `${hours}h ${minutes}m`,
        };
    } catch (e) {
        return { cpu: 0, memory: 0, memoryUsedGB: '0', memoryTotalGB: '0', disk: 0, uptime: '0h' };
    }
}

module.exports = { getSystemResources };
