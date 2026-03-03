const request = require('supertest');
const app = require('../src/backend/app');
const openclawService = require('../src/backend/services/openclawService');

describe('Agent Controller APIs', () => {
    it('GET /api/agents should return agent list with HTTP 200', async () => {
        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('stats');
        expect(res.body).toHaveProperty('agents');
        expect(Array.isArray(res.body.agents)).toBeTruthy();
    });

    it('GET /api/agents handles agents with no model/workspace and never-active status', async () => {
        // Mock openclawService to return agent text without Model/Workspace, and
        // mock detectRealActivity to return minutesAgo >= 9999 (never active)
        jest.spyOn(openclawService, 'getOpenClawData').mockResolvedValueOnce('- test-agent\n');
        jest.spyOn(openclawService, 'parseAgentsList').mockReturnValueOnce([
            { id: 'test-agent', name: null, model: null, workspace: null }
        ]);
        jest.spyOn(openclawService, 'detectRealActivity').mockReturnValueOnce({
            status: 'inactive', emoji: '⚪', label: '不活躍', minutesAgo: 9999
        });

        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toBe(200);
        expect(res.body.agents[0].model).toBe('未知');
        expect(res.body.agents[0].workspace).toBe('未知');
        expect(res.body.agents[0].lastActivity).toBe('從未活動');
        jest.restoreAllMocks();
    });

    it('GET /api/agents handles empty agents list (falsy agentsText)', async () => {
        jest.spyOn(openclawService, 'getOpenClawData').mockResolvedValueOnce(null);
        jest.spyOn(openclawService, 'parseAgentsList').mockReturnValueOnce([]);

        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toBe(200);
        expect(res.body.agents).toEqual([]);
        jest.restoreAllMocks();
    });
});
