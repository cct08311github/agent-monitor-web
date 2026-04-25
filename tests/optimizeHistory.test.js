// tests/optimizeHistory.test.js
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use an env var to pass the tmp dir into the mock factory, since jest.mock
// hoists factory functions and cannot reference arbitrary outer-scope variables.
jest.mock('../src/backend/config', () => ({
    getOptimizeConfig: jest.fn(() => ({
        plansDir: process.env.__TEST_PLANS_DIR || '/tmp/optimize-test-fallback',
        projectPath: '/tmp/project',
        geminiApiKey: '',
        telegramChannel: 'telegram',
        telegramTarget: '',
        openclawBinPath: '/usr/local/bin/openclaw',
    })),
}));

const VALID_FILENAME   = '2026-04-25-auto-optimize.md';
const VALID_FILENAME_2 = '2026-04-20-auto-optimize.md';
const VALID_FILENAME_3 = '2026-03-01-auto-optimize.md';

let tmpDir;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-test-'));
    process.env.__TEST_PLANS_DIR = tmpDir;
    // Reset module so getOptimizeConfig re-reads process.env per call
    jest.resetModules();
    jest.mock('../src/backend/config', () => ({
        getOptimizeConfig: jest.fn(() => ({
            plansDir: process.env.__TEST_PLANS_DIR || '/tmp/optimize-test-fallback',
            projectPath: '/tmp/project',
            geminiApiKey: '',
            telegramChannel: 'telegram',
            telegramTarget: '',
            openclawBinPath: '/usr/local/bin/openclaw',
        })),
    }));
});

afterEach(() => {
    delete process.env.__TEST_PLANS_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

function getSvc() {
    return require('../src/backend/services/optimizeHistoryService');
}

// ---------------------------------------------------------------------------
// listHistory
// ---------------------------------------------------------------------------

describe('optimizeHistoryService.listHistory', () => {
    it('returns files sorted descending by filename', async () => {
        const svc = getSvc();
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME_2), 'plan b');
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME), 'plan a');
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME_3), 'plan c');

        const result = await svc.listHistory();
        expect(result.map(r => r.filename)).toEqual([
            VALID_FILENAME,
            VALID_FILENAME_2,
            VALID_FILENAME_3,
        ]);
    });

    it('returns empty array when directory does not exist', async () => {
        process.env.__TEST_PLANS_DIR = '/nonexistent/path/that/does/not/exist/42';
        jest.resetModules();
        jest.mock('../src/backend/config', () => ({
            getOptimizeConfig: jest.fn(() => ({
                plansDir: process.env.__TEST_PLANS_DIR,
                projectPath: '/tmp/project',
                geminiApiKey: '',
                telegramChannel: 'telegram',
                telegramTarget: '',
                openclawBinPath: '/usr/local/bin/openclaw',
            })),
        }));
        const svc = require('../src/backend/services/optimizeHistoryService');

        const result = await svc.listHistory();
        expect(result).toEqual([]);
    });

    it('ignores files that do not match the expected regex', async () => {
        const svc = getSvc();
        fs.writeFileSync(path.join(tmpDir, 'README.md'), 'readme');
        fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'notes');
        fs.writeFileSync(path.join(tmpDir, '2026-04-25-other-thing.md'), 'other');
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME), 'plan');

        const result = await svc.listHistory();
        expect(result).toHaveLength(1);
        expect(result[0].filename).toBe(VALID_FILENAME);
    });

    it('includes size_bytes in each entry', async () => {
        const svc = getSvc();
        const content = '# Report\n\nSome content here.';
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME), content);

        const result = await svc.listHistory();
        expect(result[0].size_bytes).toBeGreaterThan(0);
        expect(result[0].size_bytes).toBe(Buffer.byteLength(content));
    });

    it('includes date derived from filename prefix', async () => {
        const svc = getSvc();
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME), 'plan');

        const result = await svc.listHistory();
        expect(result[0].date).toBe('2026-04-25');
    });
});

// ---------------------------------------------------------------------------
// readPlan
// ---------------------------------------------------------------------------

describe('optimizeHistoryService.readPlan', () => {
    it('returns file content for a valid existing file', async () => {
        const svc = getSvc();
        const content = '# Auto-Optimize Report\n\nDetails here.';
        fs.writeFileSync(path.join(tmpDir, VALID_FILENAME), content);

        const result = await svc.readPlan(VALID_FILENAME);
        expect(result).toBe(content);
    });

    it('returns null for a valid filename that does not exist', async () => {
        const svc = getSvc();
        const result = await svc.readPlan(VALID_FILENAME);
        expect(result).toBeNull();
    });

    it('throws invalid_filename for path traversal attempt ../etc/passwd', async () => {
        const svc = getSvc();
        await expect(svc.readPlan('../etc/passwd'))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });

    it('throws invalid_filename for empty string', async () => {
        const svc = getSvc();
        await expect(svc.readPlan(''))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });

    it('throws invalid_filename for filename without .md extension', async () => {
        const svc = getSvc();
        await expect(svc.readPlan('2026-04-25-auto-optimize'))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });

    it('throws invalid_filename for filename with wrong date format', async () => {
        const svc = getSvc();
        await expect(svc.readPlan('26-04-25-auto-optimize.md'))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });

    it('throws invalid_filename for null input', async () => {
        const svc = getSvc();
        await expect(svc.readPlan(null))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });

    it('throws invalid_filename for random filename not matching pattern', async () => {
        const svc = getSvc();
        await expect(svc.readPlan('report.md'))
            .rejects.toMatchObject({ code: 'invalid_filename' });
    });
});
