(function () {
    function redirectToLogin() {
        if (!location.pathname.endsWith('/login.html')) {
            var base = window.__BASE_PATH || '';
            location.href = base + '/login.html';
        }
    }

    async function checkAuth() {
        try {
            const data = await window.apiClient.get('/api/auth/me', { credentials: 'include' });
            const el = document.getElementById('authUsername');
            if (el && data.username) el.textContent = data.username;
        } catch (error) {
            if (String(error.message) === 'unauthenticated') {
                redirectToLogin();
                return false;
            }
        }
        return true;
    }

    async function logout() {
        try {
            await window.apiClient.post('/api/auth/logout', undefined, { credentials: 'include' });
        } catch (_) { }
        redirectToLogin();
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
        const res = await origFetch(url, opts);
        var base = window.__BASE_PATH || '';
        if (res.status === 401 && typeof url === 'string' && (url.startsWith('/api/') || url.startsWith(base + '/api/'))) {
            redirectToLogin();
        }
        return res;
    };

    window.redirectToLogin = redirectToLogin;
    window.checkAuth = checkAuth;
    window.logout = logout;
})();
