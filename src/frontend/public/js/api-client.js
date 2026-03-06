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
            throw new Error(data && (data.message || data.error) ? (data.message || data.error) : 'Request failed');
        }

        return data;
    }

    function get(url) {
        return request(url);
    }

    function post(url, body) {
        return request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    }

    function patch(url, body) {
        return request(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    }

    function del(url) {
        return request(url, { method: 'DELETE' });
    }

    window.apiClient = { request, get, post, patch, delete: del };
})();
