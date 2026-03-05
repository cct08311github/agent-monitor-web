// tests/optimizeService.test.js
'use strict';
jest.mock('@anthropic-ai/sdk');
jest.mock('../src/backend/services/tsdbService', () => ({
    getCostHistory: jest.fn(() => []),
    getAgentActivitySummary: jest.fn(() => []),
}));
jest.mock('../src/backend/services/alertEngine', () => ({
    getRecent: jest.fn(() => []),
}));
jest.mock('../src/backend/services/openclawService', () => ({
    listAgents: jest.fn(async () => []),
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

    it('does not throw if openclawService.listAgents rejects', async () => {
        const openclawService = require('../src/backend/services/openclawService');
        openclawService.listAgents.mockRejectedValueOnce(new Error('CLI error'));
        const data = await optimizeService.collectData();
        expect(Array.isArray(data.agents)).toBe(true);
    });
});

const Anthropic = require('@anthropic-ai/sdk');

describe('optimizeService.runPipeline', () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        Anthropic.mockImplementation(() => ({
            messages: {
                create: jest.fn()
                    .mockResolvedValueOnce({ content: [{ text: '## 草案\n優化項目A' }] })
                    .mockResolvedValueOnce({ content: [{ text: '## Opus審查\n問題1' }] })
                    .mockResolvedValueOnce({ content: [{ text: '### BUG api.js：問題A' }] })
                    .mockResolvedValueOnce({ content: [{ text: '## 最終報告\n整合完成' }] }),
            }
        }));
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns { draft, review, codeReview, report } on success', async () => {
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result).toHaveProperty('draft');
        expect(result).toHaveProperty('review');
        expect(result).toHaveProperty('codeReview');
        expect(result).toHaveProperty('report');
        expect(result.report).toContain('最終報告');
        expect(result.opusFailed).toBe(false);
    });

    it('falls back gracefully when Opus draft review fails', async () => {
        Anthropic.mockImplementation(() => ({
            messages: {
                create: jest.fn()
                    .mockResolvedValueOnce({ content: [{ text: '## 草案' }] })
                    .mockRejectedValueOnce(new Error('Opus quota'))
                    .mockResolvedValueOnce({ content: [{ text: '### BUG api.js：問題A' }] })
                    .mockResolvedValueOnce({ content: [{ text: '## 降級報告' }] }),
            }
        }));
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result.opusFailed).toBe(true);
        expect(result.report).toBeTruthy();
    });

    it('throws if ANTHROPIC_API_KEY not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        await expect(optimizeService.runPipeline(data, () => {})).rejects.toThrow('ANTHROPIC_API_KEY');
    });
});

describe('optimizeService.saveAndNotify', () => {
    let writeSpy;

    beforeEach(() => {
        writeSpy = jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {});
    });

    afterEach(() => {
        writeSpy.mockRestore();
    });

    it('saves report to docs/plans/ and returns filename with correct date pattern', async () => {
        const { execFile } = require('child_process');
        // execFile is not yet mocked here — it may actually try to run, so mock it
        jest.spyOn(require('child_process'), 'execFile').mockImplementation(
            (bin, args, opts, cb) => cb(null, '', '')
        );
        const result = await optimizeService.saveAndNotify('## 最終報告\n項目A', false, () => {});
        expect(result.filename).toMatch(/^\d{4}-\d{2}-\d{2}-auto-optimize\.md$/);
        expect(writeSpy).toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('does not throw if Telegram execFile fails', async () => {
        jest.spyOn(require('child_process'), 'execFile').mockImplementation(
            (bin, args, opts, cb) => cb(new Error('Telegram fail'), '', '')
        );
        await expect(
            optimizeService.saveAndNotify('## 報告', false, () => {})
        ).resolves.not.toThrow();
        jest.restoreAllMocks();
    });

    it('includes opusFailed warning in header when opusFailed=true', async () => {
        jest.spyOn(require('child_process'), 'execFile').mockImplementation(
            (bin, args, opts, cb) => cb(null, '', '')
        );
        let written = '';
        writeSpy.mockImplementation((file, content) => { written = content; });
        await optimizeService.saveAndNotify('## 報告', true, () => {});
        expect(written).toContain('未經 Opus 完整審查');
        jest.restoreAllMocks();
    });
});
