(function () {
    var base = window.__BASE_PATH || '';

    // If already authenticated, redirect to main app
    fetch(base + '/api/auth/me', { credentials: 'include' })
        .then(function (r) { return r.ok ? (location.href = base + '/') : null; })
        .catch(function () { });

    document.getElementById('loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var btn = document.getElementById('loginBtn');
        var errEl = document.getElementById('errorMsg');
        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value;

        btn.disabled = true;
        btn.textContent = '登入中...';
        errEl.style.display = 'none';

        try {
            var res = await fetch(base + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: username, password: password }),
            });
            var data = await res.json();
            if (res.ok && data.success) {
                location.href = base + '/';
            } else {
                var msgs = {
                    invalid_credentials: '使用者名稱或密碼錯誤',
                    auth_not_configured: '系統尚未設定密碼，請先設定 AUTH_PASSWORD_HASH',
                    too_many_attempts: '登入嘗試次數過多，請稍後再試 (' + (data.retryAfter || 60) + '秒)',
                    missing_credentials: '請輸入使用者名稱和密碼',
                };
                errEl.textContent = msgs[data.error] || ('登入失敗：' + (data.error || '未知錯誤'));
                errEl.style.display = 'block';
            }
        } catch (err) {
            errEl.textContent = '網路錯誤，請確認連線後重試';
            errEl.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = '登入';
        }
    });
})();
