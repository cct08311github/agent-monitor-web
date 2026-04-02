(function () {
    // Auto-detect base path from the first path segment of the current URL.
    // "/agent-monitor/login.html" → "/agent-monitor"
    // "/agent-monitor/deep/route"  → "/agent-monitor"
    // "/index.html" or "/"         → ""
    var match = location.pathname.match(/^(\/[^/]+)/);
    window.__BASE_PATH = match && match[1] !== '/' ? match[1] : '';
})();
