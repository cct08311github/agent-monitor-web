const request = require('supertest');
const app = require('../src/backend/app');
const openclawService = require('../src/backend/services/openclawService');
const tsdbService = require('../src/backend/services/tsdbService');

describe('Agent Controller APIs', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('GET /api/agents should return agent list with HTTP 200', async () => {
        jest.spyOn(openclawService, 'getOpenClawData').mockResolvedValueOnce('- test-agent\n');
        jest.spyOn(openclawService, 'parseAgentsList').mockReturnValueOnce([
            { id: 'test-agent', name: 'Test Agent', model: 'gemini', workspace: 'default' }
        ]);
        jest.spyOn(openclawService, 'detectRealActivity').mockReturnValueOnce({
            status: 'active', emoji: '🟢', label: '活躍', minutesAgo: 5
        });

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
    });

    it('GET /api/agents handles empty agents list (falsy agentsText)', async () => {
        jest.spyOn(openclawService, 'getOpenClawData').mockResolvedValueOnce(null);
        jest.spyOn(openclawService, 'parseAgentsList').mockReturnValueOnce([]);

        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toBe(200);
        expect(res.body.agents).toEqual([]);
    });
});

describe('Agent History API', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('GET /api/agents/foo/history returns 200 with history array', async () => {
        jest.spyOn(tsdbService, 'getAgentHistory').mockReturnValueOnce([
            { timestamp: '2024-01-01T00:00:00', cost: 0.01, input_tokens: 100, output_tokens: 50 },
        ]);
        const res = await request(app).get('/api/agents/foo/history');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(Array.isArray(res.body.history)).toBe(true);
        expect(res.body.history.length).toBe(1);
    });

    it('GET /api/agents/foo/history?hours=24 works with explicit hours param', async () => {
        jest.spyOn(tsdbService, 'getAgentHistory').mockReturnValueOnce([]);
        const res = await request(app).get('/api/agents/foo/history?hours=24');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(Array.isArray(res.body.history)).toBe(true);
        const spy = tsdbService.getAgentHistory;
        expect(spy).toHaveBeenCalledWith('foo', 24);
    });

    it('GET /api/agents/foo/history?hours=500 returns 400 invalid_hours', async () => {
        const res = await request(app).get('/api/agents/foo/history?hours=500');
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'invalid_hours');
    });

    it('GET /api/agents/foo/history?hours=0 returns 400 invalid_hours', async () => {
        const res = await request(app).get('/api/agents/foo/history?hours=0');
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error', 'invalid_hours');
    });

    it('GET /api/agents/foo%20bar/history returns 400 invalid_agent_id', async () => {
        const res = await request(app).get('/api/agents/foo%20bar/history');
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error', 'invalid_agent_id');
    });

    it('GET /api/agents/foo/history?hours=abc returns 400 invalid_hours', async () => {
        const res = await request(app).get('/api/agents/foo/history?hours=abc');
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error', 'invalid_hours');
    });
});
