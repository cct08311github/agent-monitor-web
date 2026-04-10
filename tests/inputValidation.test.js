'use strict';

const {
    validateAgentId,
    validateSessionId,
    validateDomain,
    validateTaskId,
    sanitizeString,
    PATTERNS,
} = require('../src/backend/middlewares/inputValidation');

function mockReq(overrides = {}) {
    return {
        params: {},
        body: {},
        ...overrides,
    };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// ─── validateAgentId ──────────────────────────────────────────────────────────

describe('validateAgentId', () => {
    it('calls next() for valid alphanumeric agent ID', () => {
        const req = mockReq({ params: { agentId: 'agent-123_abc' } });
        const res = mockRes();
        const next = jest.fn();
        validateAgentId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 for agent ID with special chars (e.g., ../hack)', () => {
        const req = mockReq({ params: { agentId: '../hack' } });
        const res = mockRes();
        const next = jest.fn();
        validateAgentId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'validation_error' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for agent ID exceeding 64 chars', () => {
        const req = mockReq({ params: { agentId: 'a'.repeat(65) } });
        const res = mockRes();
        const next = jest.fn();
        validateAgentId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when agentId is undefined (optional param)', () => {
        const req = mockReq({ params: {} });
        const res = mockRes();
        const next = jest.fn();
        validateAgentId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() for empty string agentId (falsy value passes through)', () => {
        const req = mockReq({ params: { agentId: '' } });
        const res = mockRes();
        const next = jest.fn();
        validateAgentId(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});

// ─── validateSessionId ────────────────────────────────────────────────────────

describe('validateSessionId', () => {
    it('calls next() for valid session ID', () => {
        const req = mockReq({ params: { sessionId: 'session-abc_123' } });
        const res = mockRes();
        const next = jest.fn();
        validateSessionId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 for session ID with special chars', () => {
        const req = mockReq({ params: { sessionId: 'bad/session' } });
        const res = mockRes();
        const next = jest.fn();
        validateSessionId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'validation_error' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for session ID exceeding 64 chars', () => {
        const req = mockReq({ params: { sessionId: 'b'.repeat(65) } });
        const res = mockRes();
        const next = jest.fn();
        validateSessionId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when sessionId is undefined', () => {
        const req = mockReq({ params: {} });
        const res = mockRes();
        const next = jest.fn();
        validateSessionId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() for empty string sessionId (falsy value passes through)', () => {
        const req = mockReq({ params: { sessionId: '' } });
        const res = mockRes();
        const next = jest.fn();
        validateSessionId(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});

// ─── validateTaskId ───────────────────────────────────────────────────────────

describe('validateTaskId', () => {
    it('returns 400 for missing id', () => {
        const req = mockReq({ params: {} });
        const res = mockRes();
        const next = jest.fn();
        validateTaskId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_task_id' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for empty id', () => {
        const req = mockReq({ params: { id: '' } });
        const res = mockRes();
        const next = jest.fn();
        validateTaskId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for id exceeding 100 chars', () => {
        const req = mockReq({ params: { id: 'c'.repeat(101) } });
        const res = mockRes();
        const next = jest.fn();
        validateTaskId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for id with invalid chars', () => {
        const req = mockReq({ params: { id: 'task/../../hack' } });
        const res = mockRes();
        const next = jest.fn();
        validateTaskId(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() for valid task id', () => {
        const req = mockReq({ params: { id: 'task-123_abc' } });
        const res = mockRes();
        const next = jest.fn();
        validateTaskId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

// ─── validateDomain ───────────────────────────────────────────────────────────

describe('validateDomain', () => {
    it('calls next() for valid domain', () => {
        const req = mockReq({ params: { domain: 'example' } });
        const res = mockRes();
        const next = jest.fn();
        validateDomain(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 for domain with special chars', () => {
        const req = mockReq({ params: { domain: 'evil.com/../../' } });
        const res = mockRes();
        const next = jest.fn();
        validateDomain(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'validation_error' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when domain is undefined', () => {
        const req = mockReq({ params: {} });
        const res = mockRes();
        const next = jest.fn();
        validateDomain(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

// ─── sanitizeString ───────────────────────────────────────────────────────────

describe('sanitizeString', () => {
    it('removes null bytes', () => {
        const result = sanitizeString('hello\x00world');
        expect(result).toBe('helloworld');
    });

    it('removes control characters (0x01-0x08, 0x0E-0x1F)', () => {
        const result = sanitizeString('hello\x01\x07\x08\x0E\x1Fworld');
        expect(result).toBe('helloworld');
    });

    it('preserves newlines and tabs', () => {
        const result = sanitizeString('hello\tworld\nfoo');
        expect(result).toBe('hello\tworld\nfoo');
    });

    it('truncates at 10000 chars', () => {
        const longString = 'a'.repeat(15000);
        const result = sanitizeString(longString);
        expect(result.length).toBe(10000);
    });

    it('returns non-string input unchanged', () => {
        expect(sanitizeString(42)).toBe(42);
        expect(sanitizeString(null)).toBe(null);
        expect(sanitizeString(undefined)).toBe(undefined);
        expect(sanitizeString({ key: 'value' })).toEqual({ key: 'value' });
    });
});

// ─── PATTERNS ─────────────────────────────────────────────────────────────────

describe('PATTERNS', () => {
    describe('PATTERNS.id', () => {
        it('matches valid alphanumeric IDs with dashes and underscores', () => {
            expect(PATTERNS.id.test('agent-123')).toBe(true);
            expect(PATTERNS.id.test('my_agent')).toBe(true);
            expect(PATTERNS.id.test('ABC123')).toBe(true);
            expect(PATTERNS.id.test('a')).toBe(true);
            expect(PATTERNS.id.test('a'.repeat(64))).toBe(true);
        });

        it('rejects IDs with invalid chars', () => {
            expect(PATTERNS.id.test('../hack')).toBe(false);
            expect(PATTERNS.id.test('bad/path')).toBe(false);
            expect(PATTERNS.id.test('space here')).toBe(false);
            expect(PATTERNS.id.test('')).toBe(false);
            expect(PATTERNS.id.test('a'.repeat(65))).toBe(false);
        });
    });

    describe('PATTERNS.domain', () => {
        it('matches valid domain labels', () => {
            expect(PATTERNS.domain.test('example')).toBe(true);
            expect(PATTERNS.domain.test('my-domain')).toBe(true);
            expect(PATTERNS.domain.test('localhost')).toBe(true);
        });

        it('rejects invalid domain formats', () => {
            expect(PATTERNS.domain.test('evil.com/path')).toBe(false);
            expect(PATTERNS.domain.test('-invalid')).toBe(false);
        });
    });
});
