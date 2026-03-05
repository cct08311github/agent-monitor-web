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
                    .mockResolvedValueOnce({ content: [{ text: '## 最終報告\n整合完成' }] }),
            }
        }));
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns { draft, review, report } on success', async () => {
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result).toHaveProperty('draft');
        expect(result).toHaveProperty('review');
        expect(result).toHaveProperty('report');
        expect(result.report).toContain('最終報告');
        expect(result.opusFailed).toBe(false);
    });

    it('falls back gracefully when Opus fails', async () => {
        Anthropic.mockImplementation(() => ({
            messages: {
                create: jest.fn()
                    .mockResolvedValueOnce({ content: [{ text: '## 草案' }] })
                    .mockRejectedValueOnce(new Error('Opus quota'))
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
