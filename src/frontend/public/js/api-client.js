(function () {
    async function request(url, options) {
        const response = await fetch(url, options);
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

    window.apiClient = { request, get, post, patch, delete: del };
})();
