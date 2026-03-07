(function () {
    function loadErrorKeys(key) {
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '{}');
            return new Map(Object.entries(stored));
        } catch { return new Map(); }
    }

    const state = {
        currentExchangeRate: 32.0,
        latestDashboard: null,
        previousAgentsMap: {},
        currentDesktopTab: 'monitor',
        currentSubTab: 'agents',
        isMobile: window.matchMedia('(max-width: 768px)').matches,
        agentSearchQuery: '',
        _currentDetailAgentId: '',
        lastErrors: [],
        dismissedErrorMap: loadErrorKeys('oc_dismissed_errors'),
        shownErrorMap: loadErrorKeys('oc_shown_errors'),
        commandRunning: false,
        lastSseTs: 0,
        _connTimerHandle: null,
        chatSending: false,
    };

    window.saveErrorKeys = function (key, map) {
        try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(map))); } catch { }
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
