const request = require('supertest');
const app = require('../src/backend/app');

describe('Agent Controller APIs', () => {
    it('GET /api/agents should return agent list with HTTP 200', async () => {
        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('stats');
        expect(res.body).toHaveProperty('agents');
        expect(Array.isArray(res.body.agents)).toBeTruthy();
    });
});
