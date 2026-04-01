(function () {
    // Auto-detect base path from current page URL.
    // e.g. "/agent-monitor/login.html" → "/agent-monitor"
    //      "/index.html" or "/" → ""
    var path = location.pathname;
    // Strip known page filenames
    var stripped = path.replace(/\/(index\.html|login\.html)$/, '');
    // Remove trailing slash but keep root as ""
    if (stripped.length > 1 && stripped.endsWith('/')) {
        stripped = stripped.slice(0, -1);
    }
    // If we're at something like /agent-monitor/css/style.css, we only want the first segment
    // But typically this script runs on HTML pages, so pathname is the page path.
    // For the SPA fallback case, pathname could be /agent-monitor/anything — we need the mount point.
    // Use a known marker: if /api/auth/me works at this prefix, it's the right base.
    // Simpler: trust the first path segment if it doesn't look like a static file.
    window.__BASE_PATH = stripped === '/' ? '' : stripped;
})();
