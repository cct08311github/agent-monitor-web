(function () {
    function redirectToLogin() {
        if (!location.pathname.endsWith('/login.html')) {
            location.href = '/login.html';
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
        if (res.status === 401 && typeof url === 'string' && url.startsWith('/api/')) {
            redirectToLogin();
        }
        return res;
    };

    window.redirectToLogin = redirectToLogin;
    window.checkAuth = checkAuth;
    window.logout = logout;
})();
