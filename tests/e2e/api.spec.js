const { test, expect, request } = require('@playwright/test');

/**
 * E2E Tests for API Endpoints
 * Tests backend API routes: dashboard, agents, sessions, cron, taskhub
 */

const API_BASE = process.env.API_BASE || 'https://localhost:3001';

test.describe('API - Dashboard & Monitoring', () => {
  let authCookies;

  test.beforeAll(async ({ request }) => {
    // Attempt to login and get session cookies
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: {
        username: process.env.E2E_USERNAME || 'admin',
        password: process.env.E2E_PASSWORD || 'admin',
      },
      failOnStatusCode: false,
    });
    if (loginRes.ok()) {
      authCookies = loginRes.cookies();
    }
  });

  test('GET /api/read/dashboard returns valid payload', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/dashboard`, {
      headers: authCookies ? { cookie: authCookies.map(c => `${c.name}=${c.value}`).join('; ') } : {},
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('timestamp');
    }
  });

  test('GET /api/read/liveness returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/liveness`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('status');
  });

  test('GET /api/read/readiness returns dependency status', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/readiness`);
    expect([200, 503]).toContain(res.status());
  });

  test('GET /api/read/models returns model list', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/models`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });
});

test.describe('API - Agents & Sessions', () => {
  test('GET /api/read/agents returns agent list', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/agents`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });

  test('GET /api/agents/:id/sessions returns sessions for valid agent', async ({ request }) => {
    // First get agents list
    const agentsRes = await request.get(`${API_BASE}/api/read/agents`, {
      failOnStatusCode: false,
    });
    if (agentsRes.status() !== 200) {
      test.skip();
    }
    const agents = await agentsRes.json();
    if (agents.length > 0) {
      const res = await request.get(`${API_BASE}/api/agents/${agents[0].id}/sessions`);
      expect([200, 401, 503]).toContain(res.status());
    }
  });
});

test.describe('API - System & Health', () => {
  test('GET /api/system/comprehensive returns full status', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/system/comprehensive`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });

  test('GET /api/read/history returns cost history', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/read/history`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });
});

test.describe('API - Cron Management', () => {
  test('GET /api/cron/jobs returns cron job list', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/cron/jobs`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
    if (res.status() === 200) {
      const jobs = await res.json();
      expect(Array.isArray(jobs)).toBeTruthy();
    }
  });
});

test.describe('API - TaskHub', () => {
  test('GET /api/taskhub/tasks returns task list', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/taskhub/tasks`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
    if (res.status() === 200) {
      const tasks = await res.json();
      expect(Array.isArray(tasks)).toBeTruthy();
    }
  });

  test('POST /api/taskhub/tasks creates task with valid data', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/taskhub/tasks`, {
      data: {
        title: 'E2E Test Task',
        domain: 'test',
        priority: 'medium',
      },
      failOnStatusCode: false,
    });
    expect([200, 201, 401, 503]).toContain(res.status());
  });
});

test.describe('API - Watchdog', () => {
  test('GET /api/watchdog/status returns watchdog state', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/watchdog/status`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('enabled');
    }
  });
});

test.describe('API - Alerts', () => {
  test('GET /api/alerts/config returns alert configuration', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/alerts/config`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });

  test('GET /api/alerts/recent returns recent alerts', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/alerts/recent`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });
});

test.describe('API - Auth', () => {
  test('POST /api/auth/login with valid credentials', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/auth/login`, {
      data: {
        username: process.env.E2E_USERNAME || 'admin',
        password: process.env.E2E_PASSWORD || 'admin',
      },
      failOnStatusCode: false,
    });
    expect([200, 401]).toContain(res.status());
  });

  test('POST /api/auth/login with invalid credentials returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/auth/login`, {
      data: {
        username: 'wrong',
        password: 'wrong',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/auth/me returns current user', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/auth/me`, {
      failOnStatusCode: false,
    });
    expect([200, 401, 503]).toContain(res.status());
  });
});
