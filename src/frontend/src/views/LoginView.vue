<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getBasePath } from '@/composables/useApi'

const router = useRouter()

const form = ref({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref('')

const errorMessages: Record<string, string> = {
  invalid_credentials: '使用者名稱或密碼錯誤',
  auth_not_configured: '驗證系統尚未設定，請聯絡管理員',
  too_many_attempts: '登入嘗試次數過多，請稍後再試',
  missing_credentials: '請輸入使用者名稱與密碼'
}

onMounted(async () => {
  // Already authenticated → redirect to dashboard
  try {
    const res = await fetch(getBasePath() + '/api/auth/me', { credentials: 'include' })
    if (res.ok) {
      router.replace({ name: 'dashboard' })
    }
  } catch {
    // Not authenticated — stay on login page
  }
})

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true

  try {
    const res = await fetch(getBasePath() + '/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.value.username,
        password: form.value.password
      })
    })

    if (res.ok) {
      router.push({ name: 'dashboard' })
    } else {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      const error = data?.error as Record<string, unknown> | undefined
      const code = (error?.code as string) || (data?.code as string) || ''
      errorMsg.value =
        errorMessages[code] ||
        (data?.message as string) ||
        '登入失敗，請再試一次'
    }
  } catch {
    errorMsg.value = '網路錯誤，請檢查連線後再試'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo">
        <div class="logo-icon">🐾</div>
        <div class="logo-text">
          <h1>OpenClaw Watch Pro</h1>
          <p>Agent Monitor Dashboard</p>
        </div>
      </div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">使用者名稱</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            required
            autofocus
            autocomplete="username"
            :disabled="loading"
          />
        </div>
        <div class="form-group">
          <label for="password">密碼</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            required
            autocomplete="current-password"
            :disabled="loading"
          />
        </div>
        <div v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</div>
        <button type="submit" class="btn-login" :disabled="loading">
          {{ loading ? '登入中...' : '登入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
@import '../assets/css/theme.css';
@import '../assets/css/login.css';

.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
</style>
