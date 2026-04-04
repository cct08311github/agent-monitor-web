import { createRouter, createWebHistory } from 'vue-router'

// Detect BASE_PATH from URL (same logic as base-path.js)
function detectBasePath(): string {
  const match = location.pathname.match(/^(\/[^/]+)/)
  return match && match[1] !== '/' ? match[1] : ''
}

export const basePath = detectBasePath()

const router = createRouter({
  history: createWebHistory(basePath || '/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true }
    },
    // Catch-all redirect to dashboard
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// Navigation guard for auth
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth === false) return true

  try {
    const res = await fetch((basePath || '') + '/api/auth/me', { credentials: 'include' })
    if (!res.ok) return { name: 'login' }
    return true
  } catch {
    return { name: 'login' }
  }
})

export default router
