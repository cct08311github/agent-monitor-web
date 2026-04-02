const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
};

const mockConfig = {
    getOpenClawConfig: jest.fn(),
};

jest.mock('fs', () => mockFs);
jest.mock('../src/backend/config', () => mockConfig);

describe('sessionReadService', () => {
    let sessionReadService;

    beforeEach(() => {
        jest.resetModules();
        Object.values(mockFs).forEach((fn) => fn.mockReset());
        mockConfig.getOpenClawConfig.mockReset();
        mockConfig.getOpenClawConfig.mockReturnValue({ agentsRoot: '/tmp/agents' });
        sessionReadService = require('../src/backend/services/sessionReadService');
    });

    describe('sanitizeId', () => {
        it('rejects IDs with invalid characters', () => {
            expect(sessionReadService.sanitizeId('../main:01?')).toBe('');
        });
        it('accepts valid IDs', () => {
            expect(sessionReadService.sanitizeId('main-agent_01')).toBe('main-agent_01');
        });
        it('rejects empty input', () => {
            expect(sessionReadService.sanitizeId('')).toBe('');
            expect(sessionReadService.sanitizeId(null)).toBe('');
        });
    });

    describe('readSessionContent', () => {
        it('rejects invalid params', () => {
            const result = sessionReadService.readSessionContent('', '');
            expect(result).toEqual({
                statusCode: 400,
                body: { success: false, error: 'invalid_params' },
            });
        });

        it('returns not_found when the session file is missing', () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = sessionReadService.readSessionContent('main', 'abc123');

            expect(mockFs.existsSync).toHaveBeenCalledWith('/tmp/agents/main/sessions/abc123.jsonl');
            expect(result).toEqual({
                statusCode: 404,
                body: { success: false, error: 'not_found' },
            });
        });

        it('parses message lines and ignores malformed or non-message lines', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue([
                '{"type":"message","timestamp":"2026-03-07T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world"},{"type":"tool_use","name":"shell"}]}}',
                '{"type":"system","message":{"role":"system","content":"skip"}}',
                '{"type":"message","message":{"role":"assistant","content":"Plain text reply"}}',
                '{bad json',
                '',
            ].join('\n'));

            const result = sessionReadService.readSessionContent('main', 'abc123');

            expect(result.statusCode).toBe(200);
            expect(result.body).toEqual({
                success: true,
                sessionId: 'abc123',
                messages: [
                    {
                        role: 'user',
                        text: 'Hello world',
                        toolUses: ['shell'],
                        ts: '2026-03-07T10:00:00Z',
                    },
                    {
                        role: 'assistant',
                        text: 'Plain text reply',
                        toolUses: [],
                        ts: null,
                    },
                ],
            });
        });
    });

    describe('readSessions', () => {
        it('rejects invalid agent ids', () => {
            const result = sessionReadService.readSessions('');
            expect(result).toEqual({
                statusCode: 400,
                body: { success: false, error: 'invalid_agent_id' },
            });
        });

        it('returns an empty list when the sessions directory does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = sessionReadService.readSessions('main');

            expect(result).toEqual({
                statusCode: 200,
                body: { success: true, sessions: [] },
            });
        });

        it('returns the latest 20 sessions in reverse lexical order with timestamps when available', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([
                '003.jsonl',
                '001.jsonl',
                '002.jsonl',
                'notes.txt',
                ...Array.from({ length: 22 }, (_, i) => `${String(100 + i)}.jsonl`),
            ]);
            mockFs.readFileSync.mockImplementation((filePath) => {
                if (filePath.endsWith('121.jsonl')) {
                    return '{"timestamp":"2026-03-07T09:00:00Z"}\n{"created_at":"2026-03-07T10:00:00Z"}';
                }
                if (filePath.endsWith('120.jsonl')) {
                    return 'line1\n{"ts":"2026-03-07T08:00:00Z"}';
                }
                if (filePath.endsWith('119.jsonl')) {
                    return 'not json\n';
                }
                throw new Error(`unexpected path ${filePath}`);
            });

            const result = sessionReadService.readSessions('main');

            expect(result.statusCode).toBe(200);
            expect(result.body.success).toBe(true);
            expect(result.body.sessions).toHaveLength(20);
            expect(result.body.sessions[0]).toEqual({
                id: '121',
                messageCount: 2,
                lastTs: '2026-03-07T10:00:00Z',
            });
            expect(result.body.sessions[1]).toEqual({
                id: '120',
                messageCount: 2,
                lastTs: '2026-03-07T08:00:00Z',
            });
            expect(result.body.sessions[2]).toEqual({
                id: '119',
                messageCount: 1,
                lastTs: null,
            });
            expect(result.body.sessions[19].id).toBe('102');
        });

        it('falls back to zero counts when reading a session file throws', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['001.jsonl']);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('read failed');
            });

            const result = sessionReadService.readSessions('main');

            expect(result).toEqual({
                statusCode: 200,
                body: {
                    success: true,
                    sessions: [{ id: '001', messageCount: 0, lastTs: null }],
                },
            });
        });
    });
});
