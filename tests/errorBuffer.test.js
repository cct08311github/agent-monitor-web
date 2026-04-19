'use strict';

const errorBuffer = require('../src/backend/services/errorBuffer');

function makeEntry(overrides = {}) {
    return {
        timestamp: '2026-04-19T00:00:00.000Z',
        requestId: 'req-1',
        method: 'GET',
        path: '/api/read/health',
        statusCode: 500,
        error: 'internal_error',
        durationMs: 42,
        ...overrides,
    };
}

beforeEach(() => {
    errorBuffer.reset();
});

describe('errorBuffer.push', () => {
    test('push valid 5xx entry and retrieve it', () => {
        errorBuffer.push(makeEntry());
        const recent = errorBuffer.getRecent(10);
        expect(recent).toHaveLength(1);
        expect(recent[0].statusCode).toBe(500);
        expect(recent[0].error).toBe('internal_error');
    });

    test('push 503 entry', () => {
        errorBuffer.push(makeEntry({ statusCode: 503 }));
        const recent = errorBuffer.getRecent(1);
        expect(recent[0].statusCode).toBe(503);
    });

    test('rejects 4xx statusCode', () => {
        errorBuffer.push(makeEntry({ statusCode: 404 }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects 2xx statusCode', () => {
        errorBuffer.push(makeEntry({ statusCode: 200 }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects 600 statusCode', () => {
        errorBuffer.push(makeEntry({ statusCode: 600 }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects non-integer statusCode', () => {
        errorBuffer.push(makeEntry({ statusCode: 500.5 }));
        errorBuffer.push(makeEntry({ statusCode: '500' }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects entry missing required field (timestamp)', () => {
        const { timestamp: _unused, ...partial } = makeEntry();
        errorBuffer.push(partial);
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects entry missing requestId', () => {
        const { requestId: _unused, ...partial } = makeEntry();
        errorBuffer.push(partial);
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects null entry', () => {
        errorBuffer.push(null);
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects non-object entry', () => {
        errorBuffer.push('string');
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('strips query string from path', () => {
        errorBuffer.push(makeEntry({ path: '/api/read/health?foo=bar&baz=1' }));
        const recent = errorBuffer.getRecent(1);
        expect(recent[0].path).toBe('/api/read/health');
    });

    test('rejects non-string error field (prevents [object Object] leak)', () => {
        errorBuffer.push(makeEntry({ error: { message: 'boom', stack: 'at /secret/path' } }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });

    test('rejects null error field', () => {
        errorBuffer.push(makeEntry({ error: null }));
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });
});

describe('errorBuffer cap at CAP (50)', () => {
    test('drops oldest when over CAP', () => {
        for (let i = 0; i < 55; i++) {
            errorBuffer.push(makeEntry({ requestId: `req-${i}`, error: `err-${i}` }));
        }
        const all = errorBuffer.getRecent(errorBuffer.CAP);
        expect(all).toHaveLength(errorBuffer.CAP);
        // Newest is first in result (newest-first)
        expect(all[0].error).toBe('err-54');
        // Oldest retained should be req-5
        const ids = all.map(e => e.requestId);
        expect(ids).not.toContain('req-0');
        expect(ids).not.toContain('req-4');
        expect(ids).toContain('req-5');
    });
});

describe('errorBuffer.getRecent ordering', () => {
    test('returns newest-first', () => {
        errorBuffer.push(makeEntry({ requestId: 'req-a', durationMs: 1 }));
        errorBuffer.push(makeEntry({ requestId: 'req-b', durationMs: 2 }));
        errorBuffer.push(makeEntry({ requestId: 'req-c', durationMs: 3 }));
        const recent = errorBuffer.getRecent(10);
        expect(recent[0].requestId).toBe('req-c');
        expect(recent[1].requestId).toBe('req-b');
        expect(recent[2].requestId).toBe('req-a');
    });

    test('getRecent default limit is 20', () => {
        for (let i = 0; i < 30; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const recent = errorBuffer.getRecent();
        expect(recent).toHaveLength(20);
    });

    test('getRecent caps at CAP (50) even if larger limit requested', () => {
        for (let i = 0; i < 50; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const recent = errorBuffer.getRecent(100);
        expect(recent).toHaveLength(50);
    });

    test('getRecent with limit < 1 falls back to default 20', () => {
        for (let i = 0; i < 30; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        expect(errorBuffer.getRecent(0)).toHaveLength(20);
        expect(errorBuffer.getRecent(-5)).toHaveLength(20);
    });

    test('returns empty array when buffer is empty', () => {
        expect(errorBuffer.getRecent(10)).toEqual([]);
    });
});

describe('errorBuffer.reset', () => {
    test('clears all entries', () => {
        errorBuffer.push(makeEntry());
        errorBuffer.push(makeEntry({ requestId: 'req-2' }));
        errorBuffer.reset();
        expect(errorBuffer.getRecent(10)).toHaveLength(0);
    });
});

describe('errorBuffer CAP exported', () => {
    test('CAP is 50', () => {
        expect(errorBuffer.CAP).toBe(50);
    });
});
