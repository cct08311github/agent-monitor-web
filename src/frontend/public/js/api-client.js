(function () {
    function prefixUrl(url) {
        var base = window.__BASE_PATH || '';
        if (base && typeof url === 'string' && url.startsWith('/')) {
            return base + url;
        }
        return url;
    }

    async function request(url, options) {
        const response = await fetch(prefixUrl(url), options);
        let data;

        try {
            data = await response.json();
        } catch (_) {
            throw new Error(response.ok ? 'Invalid JSON response' : 'Request failed');
        }

        if (!response.ok) {
            const error = new Error(data && (data.message || data.error) ? (data.message || data.error) : 'Request failed');
            error.payload = data;
            error.status = response.status;
            throw error;
        }

        return data;
    }

    function get(url, options) {
        return request(url, options);
    }

    function withJsonBody(method, url, body, options) {
        const headers = { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) };
        return request(url, {
            ...options,
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }

    function post(url, body, options) {
        return withJsonBody('POST', url, body, options);
    }

    function patch(url, body, options) {
        return withJsonBody('PATCH', url, body, options);
    }

    function del(url, options) {
        return request(url, { ...options, method: 'DELETE' });
    }

    async function withRetry(fn, maxAttempts, baseDelayMs) {
        maxAttempts = maxAttempts || 3;
        baseDelayMs = baseDelayMs || 1000;
        var lastError;
        for (var i = 0; i < maxAttempts; i++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                // Don't retry auth errors
                if (err.status === 401) throw err;
                if (i >= maxAttempts - 1) throw err;
                // Respect Retry-After header
                var delay = baseDelayMs * Math.pow(2, i);
                if (err.payload && err.payload.retryAfter) {
                    delay = Math.max(delay, Number(err.payload.retryAfter) * 1000);
                }
                await new Promise(function (resolve) { setTimeout(resolve, delay); });
            }
        }
        throw lastError;
    }

    var api = { request: request, get: get, post: post, patch: patch, delete: del, withRetry: withRetry };
    if (window.App && window.App.register) {
        App.register('ApiClient', api);
    }
    window.apiClient = api;
})();
