(function () {
    const state = {
        currentExchangeRate: 32.0,
        latestDashboard: null,
        previousAgentsMap: {},
        currentDesktopTab: 'monitor',
        currentSubTab: 'agents',
        isMobile: false,
        agentSearchQuery: '',
        _currentDetailAgentId: '',
        lastErrors: [],
        dismissedErrorMap: null,
        shownErrorMap: null,
        commandRunning: false,
        lastSseTs: 0,
        _connTimerHandle: null,
        chatSending: false,
    };

    const aliases = [
        'currentExchangeRate',
        'latestDashboard',
        'previousAgentsMap',
        'currentDesktopTab',
        'currentSubTab',
        'isMobile',
        'agentSearchQuery',
        '_currentDetailAgentId',
        'lastErrors',
        'dismissedErrorMap',
        'shownErrorMap',
        'commandRunning',
        'lastSseTs',
        '_connTimerHandle',
        'chatSending',
    ];

    window.appState = state;

    aliases.forEach((key) => {
        Object.defineProperty(window, key, {
            configurable: true,
            get() {
                return state[key];
            },
            set(value) {
                state[key] = value;
            },
        });
    });
})();
