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
