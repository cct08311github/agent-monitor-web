import { createRouter, createWebHistory } from 'vue-router'

// Use Vite's built-in base URL (injected from vite.config.ts `base` option)
// import.meta.env.BASE_URL is always '/' or '/sub-path/' at build time
export const basePath = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

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
