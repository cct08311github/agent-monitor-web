// tests/optimizeService.test.js
'use strict';
jest.mock('../src/backend/services/tsdbService', () => ({
    getCostHistory: jest.fn(() => []),
    getAgentActivitySummary: jest.fn(() => []),
}));
jest.mock('../src/backend/services/alertEngine', () => ({
    getRecent: jest.fn(() => []),
}));
jest.mock('../src/backend/services/openclawService', () => ({
    getOpenClawData: jest.fn(async () => []),
}));

const optimizeService = require('../src/backend/services/optimizeService');

describe('optimizeService.collectData', () => {
    it('returns object with costHistory, alerts, agents, existingPlans', async () => {
        const data = await optimizeService.collectData();
        expect(data).toHaveProperty('costHistory');
        expect(data).toHaveProperty('alerts');
        expect(data).toHaveProperty('agents');
        expect(data).toHaveProperty('existingPlans');
        expect(Array.isArray(data.existingPlans)).toBe(true);
    });

    it('existingPlans contains .md filenames from docs/plans/', async () => {
        const data = await optimizeService.collectData();
        data.existingPlans.forEach(f => {
            expect(f).toMatch(/\.md$/);
        });
    });

    it('does not throw if openclawService.getOpenClawData rejects', async () => {
        const openclawService = require('../src/backend/services/openclawService');
        openclawService.getOpenClawData.mockRejectedValueOnce(new Error('CLI error'));
        const data = await optimizeService.collectData();
        expect(Array.isArray(data.agents)).toBe(true);
    });
});

function mockFetchResponses(...texts) {
    let call = 0;
    global.fetch = jest.fn(() => {
        const text = texts[call++] instanceof Error
            ? Promise.reject(texts[call - 1])
            : Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: texts[call - 1] } }] }),
                text: () => Promise.resolve(''),
            });
        return text;
    });
}

describe('optimizeService.runPipeline', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
        delete process.env.GEMINI_API_KEY;
        jest.restoreAllMocks();
    });

    it('returns { draft, review, codeReview, report } on success', async () => {
        mockFetchResponses('## 草案\n優化項目A', '## 審查\n問題1', '### BUG api.js：問題A', '## 最終報告\n整合完成');
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result).toHaveProperty('draft');
        expect(result).toHaveProperty('review');
        expect(result).toHaveProperty('codeReview');
        expect(result).toHaveProperty('report');
        expect(result.report).toContain('最終報告');
        expect(result.opusFailed).toBe(false);
    });

    it('falls back gracefully when draft review fails', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 草案' } }] }) })
            .mockRejectedValueOnce(new Error('API quota'))
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '### BUG api.js' } }] }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 降級報告' } }] }) });
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result.opusFailed).toBe(true);
        expect(result.report).toBeTruthy();
    });

    it('throws if GEMINI_API_KEY not set anywhere', async () => {
        delete process.env.GEMINI_API_KEY;
        jest.spyOn(require('fs'), 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        await expect(optimizeService.runPipeline(data, () => {})).rejects.toThrow('GEMINI_API_KEY');
        jest.restoreAllMocks();
    });
});

describe('optimizeService.collectData resilience', () => {
    it('does not throw if alertEngine.getRecent throws synchronously', async () => {
        const alertEngine = require('../src/backend/services/alertEngine');
        alertEngine.getRecent.mockImplementationOnce(() => { throw new Error('alert DB down'); });
        const data = await optimizeService.collectData();
        expect(Array.isArray(data.alerts)).toBe(true);
    });
});

describe('optimizeService.runPipeline failure paths', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
        delete process.env.GEMINI_API_KEY;
        jest.restoreAllMocks();
    });

    it('falls back gracefully when Code Review step fails', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 草案' } }] }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 審查' } }] }) })
            .mockRejectedValueOnce(new Error('CR quota'))
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 降級報告' } }] }) });
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result.opusFailed).toBe(true);
        expect(result.report).toBeTruthy();
    });

    it('throws if integration (final step) fails', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 草案' } }] }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '## 審查' } }] }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '### BUG' } }] }) })
            .mockRejectedValueOnce(new Error('integrate fail'));
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        await expect(optimizeService.runPipeline(data, () => {})).rejects.toThrow('integrate fail');
    });
});

describe('optimizeService.saveAndNotify', () => {
    let writeSpy;
    let mkdirSpy;

    beforeEach(() => {
        const fs = require('fs');
        mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
        writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
        jest.spyOn(require('child_process'), 'execFile').mockImplementation(
            (bin, args, opts, cb) => cb(null, '', '')
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('saves report to docs/plans/ and returns filename with correct date pattern', async () => {
        const result = await optimizeService.saveAndNotify('## 最終報告\n項目A', false, () => {});
        expect(result.filename).toMatch(/^\d{4}-\d{2}-\d{2}-auto-optimize\.md$/);
        expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('plans'), { recursive: true });
        expect(writeSpy).toHaveBeenCalled();
    });

    it('does not throw if Telegram execFile fails', async () => {
        jest.spyOn(require('child_process'), 'execFile').mockImplementation(
            (bin, args, opts, cb) => cb(new Error('Telegram fail'), '', '')
        );
        await expect(
            optimizeService.saveAndNotify('## 報告', false, () => {})
        ).resolves.not.toThrow();
    });

    it('includes opusFailed warning in header when opusFailed=true', async () => {
        let written = '';
        writeSpy.mockImplementation((file, content) => { written = content; return Promise.resolve(); });
        await optimizeService.saveAndNotify('## 報告', true, () => {});
        expect(written).toContain('未經 Opus 完整審查');
    });

    it('throws if fs.promises.writeFile fails', async () => {
        writeSpy.mockRejectedValueOnce(new Error('ENOENT: no such file'));
        await expect(
            optimizeService.saveAndNotify('## 報告', false, () => {})
        ).rejects.toThrow('ENOENT');
    });
});
