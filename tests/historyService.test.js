const mockTsdbService = {
    getSystemHistory: jest.fn(),
    getAgentTopTokens: jest.fn(),
    getCostHistory: jest.fn(),
    getAgentActivitySummary: jest.fn(),
};

jest.mock('../src/backend/services/tsdbService', () => mockTsdbService);

describe('historyService', () => {
    let historyService;

    beforeEach(() => {
        jest.resetModules();
        Object.values(mockTsdbService).forEach((fn) => fn.mockReset());
        mockTsdbService.getSystemHistory.mockReturnValue([{ ts: 1 }]);
        mockTsdbService.getAgentTopTokens.mockReturnValue([{ id: 'main' }]);
        mockTsdbService.getCostHistory.mockReturnValue([{ usd: 1.23 }]);
        mockTsdbService.getAgentActivitySummary.mockReturnValue([{ id: 'main', active: true }]);
        historyService = require('../src/backend/services/historyService');
    });

    it('returns the expected history payload shape', () => {
        const result = historyService.getHistoryPayload();

        expect(mockTsdbService.getSystemHistory).toHaveBeenCalledWith(60);
        expect(mockTsdbService.getAgentTopTokens).toHaveBeenCalledWith(5);
        expect(mockTsdbService.getCostHistory).toHaveBeenCalledWith(60);
        expect(mockTsdbService.getAgentActivitySummary).toHaveBeenCalledWith();
        expect(result).toEqual({
            success: true,
            history: [{ ts: 1 }],
            topSpenders: [{ id: 'main' }],
            costHistory: [{ usd: 1.23 }],
            agentActivity: [{ id: 'main', active: true }],
        });
    });

    it('returns empty collections without reshaping them', () => {
        mockTsdbService.getSystemHistory.mockReturnValue([]);
        mockTsdbService.getAgentTopTokens.mockReturnValue([]);
        mockTsdbService.getCostHistory.mockReturnValue([]);
        mockTsdbService.getAgentActivitySummary.mockReturnValue([]);

        const result = historyService.getHistoryPayload();

        expect(result).toEqual({
            success: true,
            history: [],
            topSpenders: [],
            costHistory: [],
            agentActivity: [],
        });
    });
});
