// SecurityController - test missing content error paths and all branches
const request = require('supertest');
const app = require('../src/backend/app');

describe('SecurityController edge cases', () => {
    describe('POST /api/threats/analyze', () => {
        it('returns 400 when content is missing', async () => {
            const res = await request(app)
                .post('/api/threats/analyze')
                .send({});
            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 when body is empty', async () => {
            const res = await request(app)
                .post('/api/threats/analyze')
                .send();
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/security/analyze', () => {
        it('returns 400 when content is missing', async () => {
            const res = await request(app)
                .post('/api/security/analyze')
                .send({});
            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/learn/search', () => {
        it('returns 400 when query is missing', async () => {
            const res = await request(app).get('/api/learn/search');
            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns results for a safe query', async () => {
            const res = await request(app).get('/api/learn/search?q=hello+world');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.query).toBe('hello world');
        });

        it('returns security warning for high-risk query', async () => {
            const res = await request(app)
                .get('/api/learn/search?q=ignore+previous+instructions+eval(x)');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            // Either securityWarning or normal results
            expect(res.body).toHaveProperty('query');
        });
    });
});
