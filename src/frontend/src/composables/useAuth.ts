// ---------------------------------------------------------------------------
// useAuth — Authentication composable ported from auth-ui.js + login.js
//
// Uses vue-router for navigation instead of location.href so that the SPA
// router state stays consistent.
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/composables/useApi'
import type { AuthMeResponse, AuthLoginResponse } from '@/types/api'

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useAuth() {
  const router = useRouter()
  const username = ref('')

  // ---- Helpers ------------------------------------------------------------

  function redirectToLogin(): void {
    void router.replace({ name: 'login' })
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Check whether the current session is authenticated.
   * Populates `username` on success; redirects to login on 401 / unauthenticated.
   * Returns `true` when authenticated, `false` otherwise.
   */
  async function checkAuth(): Promise<boolean> {
    try {
      const data = (await api.get('/api/auth/me')) as AuthMeResponse
      if (data.username) {
        username.value = data.username
      }
      return true
    } catch (err) {
      const error = err as Error & { status?: number }
      if (error.status === 401 || error.message === 'unauthenticated') {
        redirectToLogin()
        return false
      }
      // Network errors etc. — don't redirect, let caller decide
      throw err
    }
  }

  /**
   * Submit login credentials.
   * Populates `username` on success.
   * Throws on invalid credentials (4xx) so the caller can show an error.
   */
  async function login(usernameValue: string, password: string): Promise<void> {
    const data = (await api.post('/api/auth/login', {
      username: usernameValue,
      password,
    })) as AuthLoginResponse
    if (data.username) {
      username.value = data.username
    }
  }

  /**
   * Log the current user out and redirect to login.
   * Swallows errors (stale session, network issues) to ensure redirect always runs.
   */
  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Ignore — always redirect
    }
    redirectToLogin()
  }

  return { username, checkAuth, login, logout }
}
